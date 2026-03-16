import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, getDocs, doc, getDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import {
  Container, Typography, Box, Paper, Button, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, CircularProgress, Divider, useMediaQuery, useTheme,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, LinearProgress, Tooltip,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ReceiptIcon from "@mui/icons-material/Receipt";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import LockIcon from "@mui/icons-material/Lock";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import moment from "moment";
import Swal from "sweetalert2";
import { exportJobExpensesToExcel } from "./utils/exportJobExpensesToExcel";
import { generateJobExpenseReport } from "./pdf/generateJobExpenseReport";

export default function JobExpenses() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [viewingItems, setViewingItems] = useState(null);
  const [laborEntries, setLaborEntries] = useState([]);
  const [crewUsers, setCrewUsers] = useState([]);

  // Client Advance dialog
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [advanceInput, setAdvanceInput] = useState("");
  const [savingAdvance, setSavingAdvance] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const jobDoc = await getDoc(doc(db, "jobs", id));
      if (jobDoc.exists()) {
        setJob({ id: jobDoc.id, ...jobDoc.data() });
      }

      const expensesSnap = await getDocs(collection(db, "expenses"));
      const jobExpenses = expensesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => e.jobId === id);
      setExpenses(jobExpenses);

      const invoicesSnap = await getDocs(collection(db, "invoices"));
      const jobInvoice = invoicesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .find((inv) => inv.jobId === id);
      setInvoice(jobInvoice);

      // Load all time entries for this job (approved + paid)
      const timeSnap = await getDocs(collection(db, "job_time_entries"));
      const jobTimeEntries = timeSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => e.jobId === id)
        .sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
      setLaborEntries(jobTimeEntries);

      // Load users for hourly rate lookup (time entries don't always store rate)
      const usersSnap = await getDocs(collection(db, "users"));
      setCrewUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      setLoading(false);
    } catch (error) {
      console.error("Error loading job expenses:", error);
      setLoading(false);
    }
  };

  const handleMarkComplete = async () => {
    const result = await Swal.fire({
      title: 'Mark Job Complete?',
      html: `
        <div style="text-align: left;">
          <p><strong>This will:</strong></p>
          <ul>
            <li>✅ Lock all expenses (no more changes)</li>
            <li>📄 Generate final expense report PDF</li>
            <li>✓ Update job status to Complete</li>
          </ul>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Mark Complete',
      confirmButtonColor: '#4caf50',
      cancelButtonColor: '#999',
    });

    if (result.isConfirmed) {
      try {
        Swal.fire({
          title: 'Generating Report...',
          text: 'Please wait',
          allowOutsideClick: false,
          didOpen: () => Swal.showLoading(),
        });

        await generateJobExpenseReport(job, expenses, invoice);

        await updateDoc(doc(db, 'jobs', id), {
          status: 'complete',
          completedAt: new Date().toISOString(),
          expensesLocked: true,
        });

        Swal.fire({
          icon: 'success',
          title: 'Job Marked Complete!',
          html: `
            <p>✅ Job status updated</p>
            <p>📄 Expense report PDF downloaded</p>
            <p>🔒 Expenses are now locked</p>
          `,
        });

        loadData();
      } catch (error) {
        console.error('Error marking complete:', error);
        Swal.fire('Error', 'Failed to mark job complete: ' + error.message, 'error');
      }
    }
  };

  const handleDeleteExpense = async (expenseId, expenseVendor) => {
    const result = await Swal.fire({
      title: 'Delete Expense?',
      text: `Delete expense from ${expenseVendor}? This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#f44336',
      cancelButtonColor: '#999',
    });

    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'expenses', expenseId));
        Swal.fire('Deleted!', 'Expense has been deleted', 'success');
        loadData();
      } catch (error) {
        console.error('Error deleting expense:', error);
        Swal.fire('Error', 'Failed to delete expense', 'error');
      }
    }
  };

  const handleEditExpense = (expense) => {
    navigate(`/expenses-manager?edit=${expense.id}`);
  };

  // ── ADD EXPENSE: pre-fills job so Darren never has to pick it ──
  const handleAddExpense = () => {
    navigate(`/expenses-manager?jobId=${id}&jobName=${encodeURIComponent(job.clientName)}`);
  };

  const handleExportExcel = () => {
    try {
      exportJobExpensesToExcel(job, expenses, invoice);
      Swal.fire({ icon: 'success', title: 'Excel Export Complete!', text: 'Check your Downloads folder', timer: 2000 });
    } catch (error) {
      console.error('Excel export error:', error);
      Swal.fire('Error', 'Failed to export to Excel', 'error');
    }
  };

  const handleGeneratePDF = async () => {
    try {
      Swal.fire({ title: 'Generating PDF...', text: 'Please wait', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      await generateJobExpenseReport(job, expenses, invoice);
      Swal.fire({ icon: 'success', title: 'PDF Generated!', text: 'Check your Downloads folder', timer: 2000 });
    } catch (error) {
      console.error('PDF generation error:', error);
      Swal.fire('Error', 'Failed to generate PDF', 'error');
    }
  };

  // ── CLIENT ADVANCE ──
  const handleOpenAdvanceDialog = () => {
    setAdvanceInput(job.clientAdvance ? String(job.clientAdvance) : "");
    setAdvanceDialogOpen(true);
  };

  const handleSaveAdvance = async () => {
    const amount = parseFloat(advanceInput);
    if (isNaN(amount) || amount < 0) {
      Swal.fire("Invalid Amount", "Please enter a valid dollar amount.", "warning");
      return;
    }
    setSavingAdvance(true);
    try {
      await updateDoc(doc(db, "jobs", id), { clientAdvance: amount });
      setJob((prev) => ({ ...prev, clientAdvance: amount }));
      setAdvanceDialogOpen(false);
      Swal.fire({ icon: "success", title: "Advance Saved!", timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire("Error", "Failed to save advance: " + err.message, "error");
    }
    setSavingAdvance(false);
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>Loading job expenses...</Typography>
      </Container>
    );
  }

  if (!job) {
    return (
      <Container sx={{ mt: 4 }}>
        <Typography variant="h6">Job not found</Typography>
        <Button onClick={() => navigate("/jobs")} startIcon={<ArrowBackIcon />}>Back to Jobs</Button>
      </Container>
    );
  }

  // ── FINANCIAL CALCULATIONS ──
  const totalExpenses = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const clientAdvance = parseFloat(job.clientAdvance || 0);
  const netCost = Math.max(0, totalExpenses - clientAdvance);
  const revenue = invoice ? parseFloat(invoice.total || invoice.amount || 0) : parseFloat(job.amount || 0);

  // ── LABOR CALCULATIONS ──
  // Group time entries by crew member
  const laborByCrewMember = {};
  laborEntries.forEach((entry) => {
    const name = entry.crewName || 'Unknown';
    if (!laborByCrewMember[name]) {
      // Look up rate: first check the entry itself, then fall back to users collection
      const userRecord = crewUsers.find(u =>
        u.name === name || u.email === entry.crewEmail || u.id === entry.crewId
      );
      const rate = parseFloat(entry.hourlyRate || 0) || parseFloat(userRecord?.hourlyRate || 0);
      laborByCrewMember[name] = { name, hours: 0, rate, entries: [] };
    }
    laborByCrewMember[name].hours += parseFloat(entry.hoursWorked || 0);
    laborByCrewMember[name].entries.push(entry);
    // Update rate if a better one is found
    const entryRate = parseFloat(entry.hourlyRate || 0);
    const userRecord = crewUsers.find(u =>
      u.name === name || u.email === entry.crewEmail || u.id === entry.crewId
    );
    const bestRate = Math.max(entryRate, parseFloat(userRecord?.hourlyRate || 0));
    if (bestRate > laborByCrewMember[name].rate) {
      laborByCrewMember[name].rate = bestRate;
    }
  });
  const laborRows = Object.values(laborByCrewMember);
  const totalLaborHours = laborRows.reduce((sum, r) => sum + r.hours, 0);
  const totalLaborCost = laborRows.reduce((sum, r) => sum + (r.hours * r.rate), 0);
  const totalCost = totalExpenses + totalLaborCost;

  const profit = revenue - totalCost - clientAdvance;
  const profitMargin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0;

  const budget = parseFloat(job.amount || 0);
  const budgetUsedPct = budget > 0 ? Math.min(100, (totalExpenses / budget) * 100) : 0;
  const budgetColor = budgetUsedPct >= 90 ? "error" : budgetUsedPct >= 70 ? "warning" : "success";

  const expensesByCategory = {};
  expenses.forEach((expense) => {
    const cat = expense.category || "other";
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + parseFloat(expense.amount || 0);
  });

  const isLocked = job.expensesLocked || job.status === 'complete';

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 6 }}>

      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", mb: 3, gap: 2, flexWrap: "wrap" }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/jobs")} variant="outlined">
          Back to Jobs
        </Button>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          💰 Job Expenses: {job.clientName}
        </Typography>
        {isLocked && (
          <Chip icon={<LockIcon />} label="Expenses Locked" color="warning" />
        )}
      </Box>

      {/* Action Buttons */}
      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddExpense}
          disabled={isLocked}
        >
          Add Expense
        </Button>
        <Button
          variant="outlined"
          startIcon={<AttachMoneyIcon />}
          onClick={handleOpenAdvanceDialog}
          disabled={isLocked}
          color={clientAdvance > 0 ? "success" : "inherit"}
        >
          {clientAdvance > 0 ? `Client Advance: $${clientAdvance.toFixed(2)}` : "Record Client Advance"}
        </Button>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleExportExcel}
          disabled={expenses.length === 0}
        >
          Export Excel
        </Button>
        <Button
          variant="outlined"
          startIcon={<PictureAsPdfIcon />}
          onClick={handleGeneratePDF}
          disabled={expenses.length === 0}
        >
          Generate PDF
        </Button>
        {job.status !== 'complete' && (
          <Button
            variant="contained"
            color="success"
            startIcon={<CheckCircleIcon />}
            onClick={handleMarkComplete}
          >
            Mark Complete
          </Button>
        )}
      </Box>

      {/* Budget Progress Bar */}
      {budget > 0 && (
        <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              📊 Materials Budget
            </Typography>
            <Typography variant="subtitle2" color={budgetColor + ".main"} sx={{ fontWeight: 700 }}>
              ${totalExpenses.toFixed(2)} / ${budget.toFixed(2)} ({budgetUsedPct.toFixed(0)}%)
            </Typography>
          </Box>
          <Tooltip title={`$${(budget - totalExpenses).toFixed(2)} remaining`}>
            <LinearProgress
              variant="determinate"
              value={budgetUsedPct}
              color={budgetColor}
              sx={{ height: 14, borderRadius: 7 }}
            />
          </Tooltip>
          {budgetUsedPct >= 90 && (
            <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: "block" }}>
              ⚠️ {budgetUsedPct >= 100 ? "Over budget!" : "Approaching budget limit"}
            </Typography>
          )}
        </Paper>
      )}

      {/* Profitability Summary */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: "primary.light", borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
          📊 Job Profitability
        </Typography>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={6} sm={2}>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="subtitle2" color="text.secondary">Revenue</Typography>
              <Typography variant="h5" color="primary.dark" sx={{ fontWeight: 700 }}>
                ${revenue.toFixed(2)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={2}>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="subtitle2" color="text.secondary">Materials</Typography>
              <Typography variant="h5" color="error.main" sx={{ fontWeight: 700 }}>
                ${totalExpenses.toFixed(2)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={2}>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="subtitle2" color="text.secondary">
                Labor ({totalLaborHours.toFixed(1)}h)
              </Typography>
              <Typography variant="h5" color="warning.dark" sx={{ fontWeight: 700 }}>
                ${totalLaborCost.toFixed(2)}
              </Typography>
            </Box>
          </Grid>
          {clientAdvance > 0 && (
            <Grid item xs={6} sm={2}>
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="subtitle2" color="text.secondary">Client Advance</Typography>
                <Typography variant="h5" color="success.main" sx={{ fontWeight: 700 }}>
                  -${clientAdvance.toFixed(2)}
                </Typography>
              </Box>
            </Grid>
          )}
          <Grid item xs={6} sm={2}>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="subtitle2" color="text.secondary">Profit</Typography>
              <Typography variant="h5" color={profit >= 0 ? "success.main" : "error.main"} sx={{ fontWeight: 700 }}>
                ${profit.toFixed(2)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={2}>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="subtitle2" color="text.secondary">Profit Margin</Typography>
              <Typography variant="h5" color={profit >= 0 ? "success.main" : "error.main"} sx={{ fontWeight: 700 }}>
                {profitMargin}%
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {clientAdvance > 0 && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: "rgba(255,255,255,0.5)", borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              💡 Client gave you <strong>${clientAdvance.toFixed(2)}</strong> upfront for materials.
            </Typography>
          </Box>
        )}
      </Paper>

      {/* ── LABOR SECTION ─────────────────────────────────────────────────── */}
      <Paper sx={{ borderRadius: 2, overflow: "hidden", mb: 3 }}>
        <Box sx={{ p: 2, borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            👷 Labor — {totalLaborHours.toFixed(1)} hrs / ${totalLaborCost.toFixed(2)}
          </Typography>
          <Chip
            label={laborEntries.length === 0 ? "No time entries" : `${laborEntries.length} time entries`}
            color={laborEntries.length > 0 ? "primary" : "default"}
            size="small"
          />
        </Box>

        {laborEntries.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">
              No time entries recorded for this job yet.
              Crew members clock in to this job from the Time Clock.
            </Typography>
          </Box>
        ) : (
          <Box>
            {/* Summary by crew member */}
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "#f5f5f5" }}>
                    <TableCell><strong>Crew Member</strong></TableCell>
                    <TableCell align="right"><strong>Hours</strong></TableCell>
                    <TableCell align="right"><strong>Rate</strong></TableCell>
                    <TableCell align="right"><strong>Labor Cost</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {laborRows.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell><Typography fontWeight="bold">{row.name}</Typography></TableCell>
                      <TableCell align="right">{row.hours.toFixed(1)}h</TableCell>
                      <TableCell align="right">
                        {row.rate > 0 ? `$${row.rate.toFixed(2)}/hr` : <Typography variant="caption" color="text.secondary">Rate not set</Typography>}
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight="bold" color={row.rate > 0 ? "error.main" : "text.secondary"}>
                          {row.rate > 0 ? `$${(row.hours * row.rate).toFixed(2)}` : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                          {row.entries.some(e => e.status === 'pending') && <Chip label="Pending" size="small" color="warning" />}
                          {row.entries.some(e => e.status === 'approved') && <Chip label="Approved" size="small" color="info" />}
                          {row.entries.some(e => e.status === 'paid') && <Chip label="Paid" size="small" color="success" />}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: "#fafafa" }}>
                    <TableCell><strong>TOTAL</strong></TableCell>
                    <TableCell align="right"><strong>{totalLaborHours.toFixed(1)}h</strong></TableCell>
                    <TableCell />
                    <TableCell align="right">
                      <Typography fontWeight="bold" color="error.main">${totalLaborCost.toFixed(2)}</Typography>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            {/* Individual time entries */}
            <Box sx={{ p: 2, borderTop: "1px solid #e0e0e0" }}>
              <Typography variant="subtitle2" fontWeight="bold" gutterBottom>All Time Entries</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell><strong>Crew Member</strong></TableCell>
                    <TableCell><strong>Clock In</strong></TableCell>
                    <TableCell><strong>Clock Out</strong></TableCell>
                    <TableCell align="right"><strong>Hours</strong></TableCell>
                    <TableCell><strong>Status</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {laborEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{moment(entry.clockIn).format("MMM D, YYYY")}</TableCell>
                      <TableCell>{entry.crewName}</TableCell>
                      <TableCell>{moment(entry.clockIn).format("h:mm A")}</TableCell>
                      <TableCell>
                        {entry.clockOut ? moment(entry.clockOut).format("h:mm A") : (
                          <Chip label="Still Clocked In" size="small" color="success" />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <strong>{parseFloat(entry.hoursWorked || 0).toFixed(1)}h</strong>
                        {entry.lunchMinutes > 0 && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            -{entry.lunchMinutes}m lunch
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={entry.status || 'pending'}
                          size="small"
                          color={entry.status === 'paid' ? 'success' : entry.status === 'approved' ? 'info' : 'warning'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Box>
        )}
      </Paper>

      {/* Expense Breakdown */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                💰 Expense Categories
              </Typography>
              <Divider sx={{ mb: 2 }} />
              {Object.keys(expensesByCategory).length === 0 ? (
                <Typography color="text.secondary" variant="body2">No expenses yet</Typography>
              ) : (
                Object.entries(expensesByCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, total]) => (
                    <Box
                      key={category}
                      sx={{ display: "flex", justifyContent: "space-between", mb: 1, p: 1, bgcolor: "#f5f5f5", borderRadius: 1 }}
                    >
                      <Typography sx={{ textTransform: "capitalize" }}>{category}</Typography>
                      <Typography sx={{ fontWeight: 700 }}>${total.toFixed(2)}</Typography>
                    </Box>
                  ))
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                📋 Expense Summary
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography color="text.secondary">Total Expenses</Typography>
                  <Typography sx={{ fontWeight: 700 }} color="error.main">${totalExpenses.toFixed(2)}</Typography>
                </Box>
                {clientAdvance > 0 && (
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography color="text.secondary">Client Advance</Typography>
                    <Typography sx={{ fontWeight: 700 }} color="success.main">-${clientAdvance.toFixed(2)}</Typography>
                  </Box>
                )}
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography color="text.secondary">Number of Expenses</Typography>
                  <Typography sx={{ fontWeight: 700 }}>{expenses.length}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography color="text.secondary">Receipts Collected</Typography>
                  <Typography sx={{ fontWeight: 700 }}>
                    {expenses.filter(e => e.receiptUrl).length} of {expenses.length}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography color="text.secondary">Tax Deductible</Typography>
                  <Typography sx={{ fontWeight: 700 }} color="success.main">
                    ${expenses.filter(e => e.taxDeductible).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0).toFixed(2)}
                  </Typography>
                </Box>
                {clientAdvance > 0 && (
                  <Divider />
                )}
                {clientAdvance > 0 && (
                  <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography sx={{ fontWeight: 700 }}>Your Net Cost</Typography>
                    <Typography sx={{ fontWeight: 800 }} color="warning.dark">${netCost.toFixed(2)}</Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* All Expenses Table */}
      <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 2, borderBottom: "1px solid #e0e0e0" }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>🧾 All Expenses</Typography>
        </Box>

        {expenses.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="text.secondary">No expenses recorded for this job yet</Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddExpense}
              sx={{ mt: 2 }}
              disabled={isLocked}
            >
              Add First Expense
            </Button>
          </Box>
        ) : isMobile ? (
          // Mobile card list
          <Box sx={{ p: 2 }}>
            {expenses
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .map((expense) => (
                <Card key={expense.id} sx={{ mb: 2, borderRadius: 2 }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{expense.vendor || "—"}</Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }} color="error.main">
                        ${parseFloat(expense.amount || 0).toFixed(2)}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {moment(expense.date).format("MMM DD, YYYY")}
                    </Typography>
                    <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                      <Chip label={expense.category || "other"} size="small" />
                      {expense.taxDeductible && <Chip label="Tax Deductible" color="success" size="small" />}
                      {expense.receiptUrl && <Chip icon={<ReceiptIcon />} label="Receipt" size="small" color="info" />}
                      {expense.lineItems?.length > 0 && (
                        <Chip label={`${expense.lineItems.length} items`} size="small" color="primary" />
                      )}
                    </Box>
                  </CardContent>
                  <Box sx={{ display: "flex", gap: 1, px: 2, pb: 1.5 }}>
                    {expense.receiptUrl && (
                      <Button size="small" onClick={() => window.open(expense.receiptUrl, "_blank")}>
                        View Receipt
                      </Button>
                    )}
                    {!isLocked && (
                      <>
                        <IconButton size="small" onClick={() => handleEditExpense(expense)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDeleteExpense(expense.id, expense.vendor)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </Box>
                </Card>
              ))}
          </Box>
        ) : (
          // Desktop table
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "#f5f5f5" }}>
                  <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Vendor</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Amount</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Items</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Tax Ded.</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Receipt</TableCell>
                  {!isLocked && <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {expenses
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((expense) => (
                    <TableRow key={expense.id} sx={{ "&:hover": { bgcolor: "#fafafa" } }}>
                      <TableCell>{moment(expense.date).format("MMM DD, YYYY")}</TableCell>
                      <TableCell>{expense.vendor || "—"}</TableCell>
                      <TableCell>
                        <Chip label={expense.category || "other"} size="small" sx={{ textTransform: "capitalize" }} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: "#c62828" }}>
                        ${parseFloat(expense.amount || 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {expense.lineItems?.length > 0 ? (
                          <Chip
                            label={`${expense.lineItems.length} items`}
                            size="small"
                            color="primary"
                            onClick={() => setViewingItems(expense)}
                            sx={{ cursor: "pointer" }}
                          />
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {expense.taxDeductible
                          ? <Chip label="Yes" color="success" size="small" />
                          : <Chip label="No" size="small" variant="outlined" />}
                      </TableCell>
                      <TableCell>
                        {expense.receiptUrl ? (
                          <IconButton size="small" onClick={() => window.open(expense.receiptUrl, "_blank")}>
                            <ReceiptIcon fontSize="small" color="primary" />
                          </IconButton>
                        ) : "—"}
                      </TableCell>
                      {!isLocked && (
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => handleEditExpense(expense)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => handleDeleteExpense(expense.id, expense.vendor)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                {/* Totals row */}
                <TableRow sx={{ bgcolor: "#f5f5f5" }}>
                  <TableCell colSpan={3} sx={{ fontWeight: 700 }}>TOTAL</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: "#c62828", fontSize: "1rem" }}>
                    ${totalExpenses.toFixed(2)}
                  </TableCell>
                  <TableCell colSpan={isLocked ? 3 : 4} />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* View Line Items Dialog */}
      <Dialog open={!!viewingItems} onClose={() => setViewingItems(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          📋 {viewingItems?.vendor} — Itemized Receipt
        </DialogTitle>
        <DialogContent>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
            {viewingItems && moment(viewingItems.date).format("MMMM DD, YYYY")} · Total: ${parseFloat(viewingItems?.amount || 0).toFixed(2)}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell align="center">Qty</TableCell>
                <TableCell align="right">Price</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(viewingItems?.lineItems || []).map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell>{item.item || item.description || "—"}</TableCell>
                  <TableCell align="center">{item.quantity || 1}</TableCell>
                  <TableCell align="right">${parseFloat(item.price || 0).toFixed(2)}</TableCell>
                  <TableCell align="right">${(parseFloat(item.quantity || 1) * parseFloat(item.price || 0)).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewingItems(null)}>Close</Button>
          {viewingItems?.receiptUrl && (
            <Button variant="outlined" onClick={() => window.open(viewingItems.receiptUrl, "_blank")}>
              View Receipt Photo
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Client Advance Dialog */}
      <Dialog open={advanceDialogOpen} onClose={() => setAdvanceDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>💵 Record Client Material Advance</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 1 }}>
            Enter the amount the client gave you upfront to purchase materials. This reduces your net out-of-pocket cost and is shown separately in the profitability calculation.
          </Typography>
          <TextField
            label="Amount ($)"
            type="number"
            value={advanceInput}
            onChange={(e) => setAdvanceInput(e.target.value)}
            fullWidth
            autoFocus
            inputProps={{ min: 0, step: "0.01" }}
            placeholder="0.00"
          />
          {parseFloat(advanceInput) > 0 && (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: "#e8f5e9", borderRadius: 1 }}>
              <Typography variant="body2" color="success.dark">
                Your net cost: <strong>${Math.max(0, totalExpenses - parseFloat(advanceInput || 0)).toFixed(2)}</strong> (${totalExpenses.toFixed(2)} expenses − ${parseFloat(advanceInput || 0).toFixed(2)} advance)
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdvanceDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleSaveAdvance}
            disabled={savingAdvance}
          >
            {savingAdvance ? "Saving..." : "Save Advance"}
          </Button>
        </DialogActions>
      </Dialog>

    </Container>
  );
}