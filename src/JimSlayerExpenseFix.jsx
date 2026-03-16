/**
 * JimSlayerExpenseFix.jsx
 * One-time fix: moves all expenses from the wrong Jim Slayer job
 * (quick-weed-invoice job 2LeStRj9dNnQlQos3k6a)
 * to the correct Jim Slayer landscaping job (dadk59wCV2yEEa8UJNoz)
 *
 * Route: /jim-slayer-fix
 * DELETE THIS FILE AND ROUTE AFTER RUNNING
 */

import React, { useState } from 'react';
import {
  Container, Typography, Box, Button, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Chip, Alert,
  CircularProgress, LinearProgress, Card, CardContent, Grid, Divider,
} from '@mui/material';
import { CheckCircle, Warning, Build, ArrowBack } from '@mui/icons-material';
import {
  collection, getDocs, doc, writeBatch, updateDoc, getDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';

const WRONG_JOB_ID  = '2LeStRj9dNnQlQos3k6a';   // quick-weed-invoice job (has all the expenses)
const CORRECT_JOB_ID = 'dadk59wCV2yEEa8UJNoz';   // real landscaping job (connected to bid)
const CORRECT_JOB_NAME = 'Jim Slayer';

export default function JimSlayerExpenseFix() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('idle'); // idle | scanning | preview | fixing | done
  const [expenses, setExpenses] = useState([]);
  const [progress, setProgress] = useState(0);
  const [fixResult, setFixResult] = useState({ fixed: 0, failed: 0 });

  const runScan = async () => {
    setPhase('scanning');
    try {
      const expSnap = await getDocs(collection(db, 'expenses'));
      const wrongJobExpenses = expSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(e => e.jobId === WRONG_JOB_ID);

      setExpenses(wrongJobExpenses);
      setPhase('preview');
    } catch (err) {
      Swal.fire('Error', 'Failed to scan: ' + err.message, 'error');
      setPhase('idle');
    }
  };

  const runFix = async () => {
    const confirm = await Swal.fire({
      title: `Move ${expenses.length} Expenses?`,
      html: `This will reassign all <strong>${expenses.length} expenses</strong> from the quick-weed-invoice job to the correct Jim Slayer landscaping job (<code>dadk59wCV2yEEa8UJNoz</code>).<br><br>Job expense totals will be recalculated automatically.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Move Them All',
      confirmButtonColor: '#2e7d32',
    });
    if (!confirm.isConfirmed) return;

    setPhase('fixing');
    setProgress(0);

    let fixed = 0;
    let failed = 0;

    try {
      // Batch update all expenses
      const BATCH_SIZE = 400;
      for (let i = 0; i < expenses.length; i += BATCH_SIZE) {
        const chunk = expenses.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(exp => {
          batch.update(doc(db, 'expenses', exp.id), {
            jobId: CORRECT_JOB_ID,
            jobName: CORRECT_JOB_NAME,
          });
        });
        await batch.commit();
        fixed += chunk.length;
        setProgress(Math.round(((i + chunk.length) / expenses.length) * 100));
      }

      // Recalculate CORRECT job totals from fresh data
      const freshSnap = await getDocs(collection(db, 'expenses'));
      const allExpenses = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const correctJobExpenses = allExpenses.filter(e => e.jobId === CORRECT_JOB_ID);
      const correctTotal = correctJobExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

      const wrongJobExpenses = allExpenses.filter(e => e.jobId === WRONG_JOB_ID);
      const wrongTotal = wrongJobExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

      // Update both job documents
      const jobBatch = writeBatch(db);
      jobBatch.update(doc(db, 'jobs', CORRECT_JOB_ID), {
        totalExpenses: correctTotal,
        expenseCount: correctJobExpenses.length,
      });
      jobBatch.update(doc(db, 'jobs', WRONG_JOB_ID), {
        totalExpenses: wrongTotal,
        expenseCount: wrongJobExpenses.length,
      });
      await jobBatch.commit();

    } catch (err) {
      console.error('Fix error:', err);
      failed = expenses.length - fixed;
    }

    setFixResult({ fixed, failed });
    setPhase('done');
  };

  // ── IDLE ──
  if (phase === 'idle') {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/jobs')} sx={{ mb: 3 }}>
          Back to Jobs
        </Button>
        <Paper elevation={3} sx={{ p: 4, borderRadius: 3 }}>
          <Build sx={{ fontSize: 56, color: '#1976d2', mb: 2 }} />
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
            Jim Slayer Expense Fix
          </Typography>
          <Alert severity="info" sx={{ mb: 3 }}>
            <strong>What this does:</strong> Moves all expenses currently linked to the wrong Jim Slayer job
            (quick-weed-invoice job <code>2LeStRj9...k6a</code>) to the correct landscaping job
            (<code>dadk59w...Noz</code>) that is connected to the bid and contract.
            Job expense totals are recalculated automatically.
          </Alert>
          <Alert severity="warning" sx={{ mb: 3 }}>
            <strong>One-time use only.</strong> Delete this page and its route from App.js after running.
          </Alert>
          <Button
            variant="contained"
            size="large"
            onClick={runScan}
            sx={{ px: 6, py: 1.5, borderRadius: 2, fontSize: '1.1rem' }}
          >
            🔍 Scan Now
          </Button>
        </Paper>
      </Container>
    );
  }

  // ── SCANNING ──
  if (phase === 'scanning') {
    return (
      <Container maxWidth="md" sx={{ mt: 8, textAlign: 'center' }}>
        <CircularProgress size={60} sx={{ mb: 3 }} />
        <Typography variant="h5">Scanning expenses...</Typography>
      </Container>
    );
  }

  // ── PREVIEW ──
  if (phase === 'preview') {
    const total = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/jobs')} sx={{ mb: 3 }}>
          Back to Jobs
        </Button>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
          🔍 Found {expenses.length} Expenses to Move
        </Typography>

        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={4}>
            <Card sx={{ borderRadius: 3, border: '1px solid #bbdefb', backgroundColor: '#e3f2fd' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h3" sx={{ fontWeight: 800, color: '#1565c0' }}>{expenses.length}</Typography>
                <Typography color="text.secondary">Expenses to Move</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card sx={{ borderRadius: 3, border: '1px solid #ffcdd2', backgroundColor: '#fff8f8' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h5" sx={{ fontWeight: 800, color: '#c62828', mt: 1 }}>
                  ${total.toFixed(2)}
                </Typography>
                <Typography color="text.secondary">Total Value</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card sx={{ borderRadius: 3, border: '1px solid #c8e6c9', backgroundColor: '#f1f8e9' }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Moving TO</Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                  Jim Slayer
                </Typography>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#666' }}>
                  dadk59wCV2yEEa8UJNoz
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Paper elevation={2} sx={{ mb: 4, borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ p: 2, backgroundColor: '#e3f2fd' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1565c0' }}>
              Expenses That Will Be Moved
            </Typography>
          </Box>
          <TableContainer sx={{ maxHeight: 450 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Vendor</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Amount</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Receipt</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {expenses.map(exp => (
                  <TableRow key={exp.id} sx={{ '&:hover': { backgroundColor: '#f5f5f5' } }}>
                    <TableCell>{exp.date}</TableCell>
                    <TableCell>{exp.vendor || '—'}</TableCell>
                    <TableCell>
                      <Chip label={exp.category || 'other'} size="small" />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#c62828' }}>
                      ${parseFloat(exp.amount || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {exp.receiptUrl
                        ? <Chip label="✓ Has Receipt" size="small" color="success" />
                        : <Chip label="No Receipt" size="small" variant="outlined" />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Box sx={{ textAlign: 'center' }}>
          <Button
            variant="contained"
            color="success"
            size="large"
            onClick={runFix}
            sx={{ px: 6, py: 1.5, fontSize: '1.1rem', borderRadius: 2 }}
          >
            ✅ Move All {expenses.length} Expenses to Correct Job
          </Button>
        </Box>
      </Container>
    );
  }

  // ── FIXING ──
  if (phase === 'fixing') {
    return (
      <Container maxWidth="sm" sx={{ mt: 8, textAlign: 'center' }}>
        <Build sx={{ fontSize: 64, color: '#1976d2', mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>Moving Expenses...</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Updating Firestore and recalculating job totals
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

  // ── DONE ──
  if (phase === 'done') {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Paper elevation={3} sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
          <CheckCircle sx={{ fontSize: 72, color: '#2e7d32', mb: 2 }} />
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            ✅ Done!
          </Typography>
          <Divider sx={{ my: 3 }} />
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={6}>
              <Typography variant="h3" sx={{ fontWeight: 800, color: '#2e7d32' }}>{fixResult.fixed}</Typography>
              <Typography color="text.secondary">Expenses Moved</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="h3" sx={{ fontWeight: 800, color: fixResult.failed > 0 ? '#c62828' : '#999' }}>
                {fixResult.failed}
              </Typography>
              <Typography color="text.secondary">Failed</Typography>
            </Grid>
          </Grid>
          <Alert severity="success" sx={{ mb: 3, textAlign: 'left' }}>
            <strong>All expenses moved to the correct Jim Slayer landscaping job.</strong><br />
            Job expense totals have been recalculated. Go to Jim Slayer's job and click
            "View Expenses & Profit" to verify everything looks correct.
          </Alert>
          <Alert severity="warning" sx={{ mb: 3, textAlign: 'left' }}>
            <strong>Remember:</strong> Delete <code>JimSlayerExpenseFix.jsx</code> and remove
            its route from <code>App.js</code> — this tool is no longer needed.
          </Alert>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button
              variant="contained"
              color="success"
              size="large"
              onClick={() => navigate(`/job-expenses/${CORRECT_JOB_ID}`)}
              sx={{ borderRadius: 2 }}
            >
              View Jim Slayer's Expenses
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => navigate('/jobs')}
              sx={{ borderRadius: 2 }}
            >
              Go to Jobs
            </Button>
          </Box>
        </Paper>
      </Container>
    );
  }

  return null;
}