/**
 * ExpenseRepairTool.jsx
 * One-time admin utility that finds all expenses with missing or broken jobId
 * and automatically links them to the correct job by matching jobName → job.clientName
 * 
 * Navigate to: /expense-repair
 */

import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Box, Button, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, Alert,
  CircularProgress, LinearProgress, Card, CardContent, Grid, Divider,
} from '@mui/material';
import {
  CheckCircle, Warning, Error as ErrorIcon, Build, ArrowBack,
} from '@mui/icons-material';
import { collection, getDocs, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';

export default function ExpenseRepairTool() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('idle'); // idle | scanning | preview | fixing | done
  const [expenses, setExpenses] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [fixable, setFixable] = useState([]);      // expenses we can auto-fix
  const [unfixable, setUnfixable] = useState([]);   // expenses with no job name match
  const [alreadyOk, setAlreadyOk] = useState([]);   // expenses that are already fine
  const [progress, setProgress] = useState(0);
  const [fixResults, setFixResults] = useState({ fixed: 0, failed: 0, errors: [] });

  const runScan = async () => {
    setPhase('scanning');
    try {
      // Load all expenses
      const expSnap = await getDocs(collection(db, 'expenses'));
      const allExpenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setExpenses(allExpenses);

      // Load all jobs
      const jobSnap = await getDocs(collection(db, 'jobs'));
      const allJobs = jobSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setJobs(allJobs);

      // Build a lookup: clientName (lowercase) → job
      const jobByName = {};
      allJobs.forEach(j => {
        if (j.clientName) {
          jobByName[j.clientName.trim().toLowerCase()] = j;
        }
      });

      // Build a set of valid job IDs for quick lookup
      const validJobIds = new Set(allJobs.map(j => j.id));

      const fixableList = [];
      const unfixableList = [];
      const okList = [];

      allExpenses.forEach(exp => {
        const hasValidJobId = exp.jobId && validJobIds.has(exp.jobId);

        if (hasValidJobId) {
          // Already correctly linked
          okList.push(exp);
          return;
        }

        // Broken: jobId is null, empty, or points to a non-existent job
        // Try to match by jobName
        const nameKey = (exp.jobName || '').trim().toLowerCase();

        // Skip "General Business Expense" — these are intentionally not linked
        if (nameKey === 'general business expense' || nameKey === '') {
          okList.push({ ...exp, _note: 'General / intentionally unlinked' });
          return;
        }

        const matchedJob = jobByName[nameKey];
        if (matchedJob) {
          fixableList.push({
            ...exp,
            _matchedJob: matchedJob,
            _badJobId: exp.jobId || null,
          });
        } else {
          // No match found — flag for manual review
          unfixableList.push(exp);
        }
      });

      setFixable(fixableList);
      setUnfixable(unfixableList);
      setAlreadyOk(okList);
      setPhase('preview');
    } catch (err) {
      console.error('Scan error:', err);
      Swal.fire('Error', 'Failed to scan expenses: ' + err.message, 'error');
      setPhase('idle');
    }
  };

  const runFix = async () => {
    const confirm = await Swal.fire({
      title: `Fix ${fixable.length} Expenses?`,
      html: `This will update <strong>${fixable.length}</strong> expense records in Firestore, linking them to the correct job.<br><br>This cannot be undone automatically — but your data isn't deleted, only the jobId field is corrected.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Fix Them All',
      confirmButtonColor: '#2e7d32',
      cancelButtonText: 'Cancel',
    });
    if (!confirm.isConfirmed) return;

    setPhase('fixing');
    setProgress(0);

    let fixed = 0;
    let failed = 0;
    const errors = [];

    // Process in batches of 500 (Firestore batch limit)
    const BATCH_SIZE = 400;
    for (let i = 0; i < fixable.length; i += BATCH_SIZE) {
      const chunk = fixable.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      chunk.forEach(exp => {
        const expRef = doc(db, 'expenses', exp.id);
        batch.update(expRef, {
          jobId: exp._matchedJob.id,
          jobName: exp._matchedJob.clientName,
        });
      });

      try {
        await batch.commit();
        fixed += chunk.length;
      } catch (err) {
        console.error('Batch error:', err);
        failed += chunk.length;
        errors.push(err.message);
      }

      setProgress(Math.round(((i + chunk.length) / fixable.length) * 100));
    }

    // Now rebuild job totalExpenses for each affected job
    // Group fixed expenses by matched job
    const expensesByJob = {};
    fixable.forEach(exp => {
      const jid = exp._matchedJob.id;
      if (!expensesByJob[jid]) expensesByJob[jid] = [];
      expensesByJob[jid].push(exp);
    });

    // For each affected job, re-total ALL its expenses from Firestore
    // (safest approach — avoids stale counts)
    try {
      const freshExpSnap = await getDocs(collection(db, 'expenses'));
      const freshExpenses = freshExpSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const jobBatch = writeBatch(db);
      for (const jid of Object.keys(expensesByJob)) {
        const jobTotal = freshExpenses
          .filter(e => e.jobId === jid)
          .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        const jobCount = freshExpenses.filter(e => e.jobId === jid).length;

        jobBatch.update(doc(db, 'jobs', jid), {
          totalExpenses: jobTotal,
          expenseCount: jobCount,
        });
      }
      await jobBatch.commit();
    } catch (err) {
      console.error('Job total update error:', err);
      errors.push('Job totals update failed: ' + err.message);
    }

    setFixResults({ fixed, failed, errors });
    setPhase('done');
  };

  // ── PHASE: IDLE ──
  if (phase === 'idle') {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/expenses-manager')} sx={{ mb: 3 }}>
          Back to Expenses
        </Button>
        <Paper elevation={3} sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
          <Build sx={{ fontSize: 64, color: '#1976d2', mb: 2 }} />
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            Expense Repair Tool
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 500, mx: 'auto' }}>
            This tool scans all expenses for missing or broken job links (caused by the receipt scanner not capturing the job ID), then automatically fixes them by matching the job name.
          </Typography>
          <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>
            <strong>What it does:</strong> Finds expenses where the job name is "Jim Slayer" (or any client name) but the jobId is missing or wrong. Automatically links them to the correct job record in Firestore and recalculates each job's expense totals.
          </Alert>
          <Button variant="contained" size="large" onClick={runScan} sx={{ px: 6, py: 1.5, fontSize: '1.1rem', borderRadius: 2 }}>
            🔍 Scan All Expenses
          </Button>
        </Paper>
      </Container>
    );
  }

  // ── PHASE: SCANNING ──
  if (phase === 'scanning') {
    return (
      <Container maxWidth="md" sx={{ mt: 4, textAlign: 'center' }}>
        <CircularProgress size={60} sx={{ mb: 3 }} />
        <Typography variant="h5">Scanning Firestore...</Typography>
        <Typography color="text.secondary">Loading all expenses and jobs</Typography>
      </Container>
    );
  }

  // ── PHASE: PREVIEW ──
  if (phase === 'preview') {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/expenses-manager')} sx={{ mb: 3 }}>
          Back to Expenses
        </Button>

        <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
          🔍 Scan Results
        </Typography>

        {/* Summary cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={4}>
            <Card sx={{ borderRadius: 3, border: '1px solid #c8e6c9', backgroundColor: '#f1f8e9' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <CheckCircle sx={{ fontSize: 40, color: '#2e7d32', mb: 1 }} />
                <Typography variant="h3" sx={{ fontWeight: 800, color: '#2e7d32' }}>{alreadyOk.length}</Typography>
                <Typography variant="body2" color="text.secondary">Already Correct</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card sx={{ borderRadius: 3, border: '1px solid #bbdefb', backgroundColor: '#e3f2fd' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Build sx={{ fontSize: 40, color: '#1565c0', mb: 1 }} />
                <Typography variant="h3" sx={{ fontWeight: 800, color: '#1565c0' }}>{fixable.length}</Typography>
                <Typography variant="body2" color="text.secondary">Can Auto-Fix</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card sx={{ borderRadius: 3, border: unfixable.length > 0 ? '1px solid #ffcdd2' : '1px solid #e0e0e0', backgroundColor: unfixable.length > 0 ? '#fff8f8' : '#fafafa' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Warning sx={{ fontSize: 40, color: unfixable.length > 0 ? '#c62828' : '#999', mb: 1 }} />
                <Typography variant="h3" sx={{ fontWeight: 800, color: unfixable.length > 0 ? '#c62828' : '#999' }}>{unfixable.length}</Typography>
                <Typography variant="body2" color="text.secondary">Need Manual Review</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {fixable.length === 0 && unfixable.length === 0 && (
          <Alert severity="success" sx={{ borderRadius: 2, mb: 3 }}>
            <strong>Everything looks good!</strong> All {alreadyOk.length} expenses are correctly linked to jobs.
          </Alert>
        )}

        {/* FIXABLE TABLE */}
        {fixable.length > 0 && (
          <Paper elevation={2} sx={{ mb: 4, borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ p: 2.5, backgroundColor: '#e3f2fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#1565c0' }}>
                ✅ {fixable.length} Expenses — Will Be Auto-Fixed
              </Typography>
              <Button
                variant="contained"
                color="primary"
                size="large"
                onClick={runFix}
                sx={{ borderRadius: 2, fontWeight: 700 }}
              >
                🔧 Fix All Now
              </Button>
            </Box>
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Vendor</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Job Name Stored</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Old jobId</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>→ Matched Job</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fixable.map(exp => (
                    <TableRow key={exp.id} sx={{ '&:hover': { backgroundColor: '#f5f5f5' } }}>
                      <TableCell>{exp.date}</TableCell>
                      <TableCell>{exp.vendor || '—'}</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#c62828' }}>
                        ${parseFloat(exp.amount || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>{exp.jobName || '—'}</TableCell>
                      <TableCell>
                        <Chip
                          label={exp._badJobId ? exp._badJobId.substring(0, 12) + '…' : 'null'}
                          size="small"
                          color="error"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={`${exp._matchedJob.clientName} (${exp._matchedJob.id.substring(0, 8)}…)`}
                          size="small"
                          color="success"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {/* UNFIXABLE TABLE */}
        {unfixable.length > 0 && (
          <Paper elevation={2} sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ p: 2.5, backgroundColor: '#fff3e0' }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#e65100' }}>
                ⚠️ {unfixable.length} Expenses — Need Manual Review
              </Typography>
              <Typography variant="body2" color="text.secondary">
                These expenses have a job name that doesn't match any existing job. They may be general expenses or from deleted jobs.
              </Typography>
            </Box>
            <TableContainer sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Vendor</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Job Name Stored</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Issue</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {unfixable.map(exp => (
                    <TableRow key={exp.id}>
                      <TableCell>{exp.date}</TableCell>
                      <TableCell>{exp.vendor || '—'}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>${parseFloat(exp.amount || 0).toFixed(2)}</TableCell>
                      <TableCell>{exp.jobName || '—'}</TableCell>
                      <TableCell>
                        <Chip label="No job match found" size="small" color="warning" variant="outlined" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}

        {fixable.length > 0 && (
          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Button
              variant="contained"
              color="success"
              size="large"
              onClick={runFix}
              sx={{ px: 6, py: 1.5, fontSize: '1.1rem', borderRadius: 2 }}
            >
              🔧 Fix All {fixable.length} Expenses Now
            </Button>
          </Box>
        )}
      </Container>
    );
  }

  // ── PHASE: FIXING ──
  if (phase === 'fixing') {
    return (
      <Container maxWidth="sm" sx={{ mt: 8, textAlign: 'center' }}>
        <Build sx={{ fontSize: 64, color: '#1976d2', mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Fixing Expenses...</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Writing to Firestore and recalculating job totals
        </Typography>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{ height: 12, borderRadius: 6, mb: 1 }}
        />
        <Typography variant="body2" color="text.secondary">{progress}% complete</Typography>
      </Container>
    );
  }

  // ── PHASE: DONE ──
  if (phase === 'done') {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Paper elevation={3} sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
          {fixResults.failed === 0 ? (
            <CheckCircle sx={{ fontSize: 72, color: '#2e7d32', mb: 2 }} />
          ) : (
            <Warning sx={{ fontSize: 72, color: '#f57c00', mb: 2 }} />
          )}
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            {fixResults.failed === 0 ? '✅ All Done!' : '⚠️ Completed with Some Errors'}
          </Typography>
          <Divider sx={{ my: 3 }} />
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={6}>
              <Typography variant="h3" sx={{ fontWeight: 800, color: '#2e7d32' }}>{fixResults.fixed}</Typography>
              <Typography color="text.secondary">Expenses Fixed</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="h3" sx={{ fontWeight: 800, color: fixResults.failed > 0 ? '#c62828' : '#999' }}>
                {fixResults.failed}
              </Typography>
              <Typography color="text.secondary">Failed</Typography>
            </Grid>
          </Grid>
          {fixResults.errors.length > 0 && (
            <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
              {fixResults.errors.map((e, i) => <div key={i}>{e}</div>)}
            </Alert>
          )}
          <Alert severity="success" sx={{ mb: 3, textAlign: 'left' }}>
            <strong>Job expense totals have been recalculated.</strong> Go to any job's expense page and you should now see all previously missing expenses.
          </Alert>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button variant="contained" color="success" size="large" onClick={() => navigate('/expenses-manager')} sx={{ borderRadius: 2 }}>
              Go to Expenses
            </Button>
            <Button variant="outlined" size="large" onClick={() => navigate('/jobs')} sx={{ borderRadius: 2 }}>
              Go to Jobs
            </Button>
          </Box>
        </Paper>
      </Container>
    );
  }

  return null;
}