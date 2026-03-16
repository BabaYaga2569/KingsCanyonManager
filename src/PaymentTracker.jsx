// This is a COMPLETE replacement for PaymentTracker.jsx
// Adds: Edit payments, Delete payments, Payment plan tracking, Enhanced status

import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where } from "firebase/firestore";
import { db } from "./firebase";
import {
  Container,
  Typography,
  Button,
  Box,
  Paper,
  Divider,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Grid,
  useMediaQuery,
  useTheme,
  IconButton,
  InputAdornment,  // ← ADD THIS LINE
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent,
} from "@mui/lab";
import Swal from "sweetalert2";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddIcon from "@mui/icons-material/Add";
import PaymentIcon from "@mui/icons-material/Payment";
import ReceiptIcon from "@mui/icons-material/Receipt";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PendingIcon from "@mui/icons-material/Pending";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ScheduleIcon from "@mui/icons-material/Schedule";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import moment from "moment";
import generatePaymentReceipt from "./pdf/generatePaymentReceipt";
import { viewPaymentReceiptPDF } from "./utils/pdfViewerUtils";

export default function PaymentTracker() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [editPaymentOpen, setEditPaymentOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);

  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    paymentMethod: "cash",
    paymentDate: moment().format("YYYY-MM-DD"),
    reference: "",
    notes: "",
    generateReceipt: true,
  });

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      // Load invoice
      const invoiceDoc = await getDoc(doc(db, "invoices", id));
      if (invoiceDoc.exists()) {
        setInvoice({ id: invoiceDoc.id, ...invoiceDoc.data() });
      } else {
        Swal.fire("Not Found", "Invoice not found", "error");
        navigate("/invoices");
        return;
      }

      // Load payments for this invoice
      const paymentsQuery = query(
        collection(db, "payments"),
        where("invoiceId", "==", id)
      );
      const paymentsSnap = await getDocs(paymentsQuery);
      const paymentsData = paymentsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      // Sort by date descending (newest first)
      paymentsData.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
      setPayments(paymentsData);

      setLoading(false);
    } catch (error) {
      console.error("Error loading payment data:", error);
      Swal.fire("Error", "Failed to load payment data", "error");
      setLoading(false);
    }
  };

  const handleAddPayment = async () => {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      Swal.fire("Invalid Amount", "Please enter a valid payment amount", "warning");
      return;
    }

    const paymentAmount = parseFloat(paymentForm.amount);
    const remainingBalance = getRemainingBalance();

    if (paymentAmount > remainingBalance) {
      const result = await Swal.fire({
        title: "Overpayment",
        text: `Payment amount ($${paymentAmount.toFixed(2)}) exceeds remaining balance ($${remainingBalance.toFixed(2)}). Continue?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, Record It",
      });
      if (!result.isConfirmed) return;
    }

    try {
      // Lookup customerId if not present on invoice
      let customerId = invoice.customerId || null;
      if (!customerId && invoice.clientName) {
        try {
          const customersQuery = query(
            collection(db, 'customers'),
            where('name', '==', invoice.clientName)
          );
          const customersSnap = await getDocs(customersQuery);
          if (!customersSnap.empty) {
            customerId = customersSnap.docs[0].id;
          }
        } catch (err) {
          console.warn('Failed to lookup customer by name:', err);
        }
      }

      // Create payment record
      const paymentData = {
        invoiceId: id,
        clientName: invoice.clientName,
        customerId: customerId,
        amount: paymentAmount,
        paymentMethod: paymentForm.paymentMethod,
        paymentDate: paymentForm.paymentDate,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
        receiptGenerated: paymentForm.generateReceipt,
        createdAt: new Date().toISOString(),
      };

      const paymentRef = await addDoc(collection(db, "payments"), paymentData);

      // Update invoice status
      await updateInvoiceStatus();

      // Generate receipt if requested
      if (paymentForm.generateReceipt) {
        try {
          const newTotalPaid = getTotalPaid() + paymentAmount;
          const newRemainingBalance = parseFloat(invoice.total || invoice.amount || 0) - newTotalPaid;
          
          await viewPaymentReceiptPDF({
            payment: { ...paymentData, id: paymentRef.id },
            invoice: invoice,
            newTotalPaid: newTotalPaid,
            newRemainingBalance: newRemainingBalance,
          }, generatePaymentReceipt);
        } catch (error) {
          console.error("Receipt generation error:", error);
        }
      }

      Swal.fire({
        icon: "success",
        title: "Payment Recorded!",
        text: `$${paymentAmount.toFixed(2)} payment recorded successfully`,
        timer: 2000,
      });

      setAddPaymentOpen(false);
      setPaymentForm({
        amount: "",
        paymentMethod: "cash",
        paymentDate: moment().format("YYYY-MM-DD"),
        reference: "",
        notes: "",
        generateReceipt: true,
      });

      loadData();
    } catch (error) {
      console.error("Error recording payment:", error);
      Swal.fire("Error", "Failed to record payment", "error");
    }
  };

  // NEW: Edit payment function
  const handleEditPayment = async () => {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      Swal.fire("Invalid Amount", "Please enter a valid payment amount", "warning");
      return;
    }

    try {
      const paymentAmount = parseFloat(paymentForm.amount);
      
      await updateDoc(doc(db, "payments", editingPayment.id), {
        amount: paymentAmount,
        paymentMethod: paymentForm.paymentMethod,
        paymentDate: paymentForm.paymentDate,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
        updatedAt: new Date().toISOString(),
      });

      // Update invoice status
      await updateInvoiceStatus();

      Swal.fire({
        icon: "success",
        title: "Payment Updated!",
        text: `Payment updated successfully`,
        timer: 2000,
      });

      setEditPaymentOpen(false);
      setEditingPayment(null);
      loadData();
    } catch (error) {
      console.error("Error updating payment:", error);
      Swal.fire("Error", "Failed to update payment", "error");
    }
  };

  // NEW: Delete payment function
  const handleDeletePayment = async (payment) => {
    const result = await Swal.fire({
      title: "Delete Payment?",
      text: `Delete $${parseFloat(payment.amount).toFixed(2)} payment from ${moment(payment.paymentDate).format("MMM DD, YYYY")}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      confirmButtonColor: "#d32f2f",
    });

    if (!result.isConfirmed) return;

    try {
      await deleteDoc(doc(db, "payments", payment.id));
      
      // Update invoice status
      await updateInvoiceStatus();

      Swal.fire({
        icon: "success",
        title: "Deleted!",
        text: "Payment deleted successfully",
        timer: 2000,
      });

      loadData();
    } catch (error) {
      console.error("Error deleting payment:", error);
      Swal.fire("Error", "Failed to delete payment", "error");
    }
  };

  // NEW: Update invoice status based on payments and payment plan
  const updateInvoiceStatus = async () => {
    // ✅ FIX: Recalculate from Firestore instead of using stale state
    const paymentsQuery = query(
      collection(db, "payments"),
      where("invoiceId", "==", id)
    );
    const paymentsSnap = await getDocs(paymentsQuery);
    const freshPayments = paymentsSnap.docs.map((d) => d.data());
    
    const totalAmount = parseFloat(invoice.total || invoice.amount || 0);
    const totalPaid = freshPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const remainingBalance = totalAmount - totalPaid;

    let paymentStatus = "unpaid";
    let invoiceStatus = invoice.status || "Pending";

    if (remainingBalance <= 0) {
      paymentStatus = "paid";
      invoiceStatus = "Paid";
    } else if (totalPaid > 0) {
      // Check if on payment plan
      if (invoice.paymentPlan && invoice.paymentPlan.enabled) {
        paymentStatus = "payment_plan";
        invoiceStatus = "Making Payments";
      } else {
        paymentStatus = "partial";
        invoiceStatus = "Sent";
      }
    }

    await updateDoc(doc(db, "invoices", id), {
      totalPaid: totalPaid,
      remainingBalance: remainingBalance,
      paymentStatus: paymentStatus,
      status: invoiceStatus,
      lastPaymentDate: freshPayments.length > 0 ? freshPayments[0].paymentDate : null,
    });
    
    console.log("✅ Invoice status updated:", invoiceStatus, "Total Paid:", totalPaid);
  };

  // NEW: Open edit dialog
  const openEditDialog = (payment) => {
    setEditingPayment(payment);
    setPaymentForm({
      amount: payment.amount.toString(),
      paymentMethod: payment.paymentMethod || "cash",
      paymentDate: payment.paymentDate,
      reference: payment.reference || "",
      notes: payment.notes || "",
      generateReceipt: false,
    });
    setEditPaymentOpen(true);
  };

  const getTotalPaid = () => {
    return payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  };

  const getRemainingBalance = () => {
    const total = parseFloat(invoice?.total || invoice?.amount || 0);
    const paid = getTotalPaid();
    return total - paid;
  };

  const getPaymentMethodLabel = (method) => {
    const methods = {
      cash: "Cash",
      check: "Check",
      zelle: "Zelle",
      credit_card: "Credit Card",
      venmo: "Venmo",
      paypal: "PayPal",
      other: "Other",
    };
    return methods[method] || method;
  };

  const getPaymentMethodIcon = (method) => {
    return "💵";
  };

  // NEW: Get payment plan status
  const getPaymentPlanStatus = () => {
    if (!invoice.paymentPlan || !invoice.paymentPlan.enabled) {
      return null;
    }

    const plan = invoice.paymentPlan;
    const totalAmount = parseFloat(invoice.total || invoice.amount || 0);
    const totalPaid = getTotalPaid();
    const paymentsScheduled = plan.schedule ? plan.schedule.length : 0;
    const paymentsMade = payments.length;

    return {
      frequency: plan.frequency,
      totalPayments: paymentsScheduled,
      paymentsMade: paymentsMade,
      downPayment: plan.downPayment || 0,
      installmentAmount: plan.installmentAmount || 0,
      schedule: plan.schedule || [],
      nextDueDate: getNextDueDate(plan.schedule, payments),
    };
  };

  // NEW: Get next due date from schedule
  const getNextDueDate = (schedule, payments) => {
    if (!schedule || schedule.length === 0) return null;
    
    const paidDates = payments.map(p => p.paymentDate);
    const unpaid = schedule.find(s => !paidDates.includes(s.dueDate));
    
    return unpaid ? unpaid.dueDate : null;
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading payment data...
        </Typography>
      </Container>
    );
  }

  if (!invoice) {
    return (
      <Container sx={{ mt: 4 }}>
        <Typography variant="h6">Invoice not found</Typography>
      </Container>
    );
  }

  const totalAmount = parseFloat(invoice.total || invoice.amount || 0);
  const totalPaid = getTotalPaid();
  const remainingBalance = getRemainingBalance();
  const percentPaid = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;
  const paymentPlanStatus = getPaymentPlanStatus();

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 6 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 3, gap: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/invoices")}
          variant="outlined"
        >
          Back
        </Button>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Payment Tracker
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddPaymentOpen(true)}
          disabled={remainingBalance <= 0}
        >
          {isMobile ? "Add" : "Add Payment"}
        </Button>
      </Box>

      {/* Invoice Summary Card */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {invoice.clientName}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Invoice #{id.slice(-8).toUpperCase()}
        </Typography>
        <Divider sx={{ my: 2 }} />

        <Grid container spacing={3}>
          <Grid item xs={12} sm={4}>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="subtitle2" color="text.secondary">
                Invoice Total
              </Typography>
              <Typography variant="h4" color="primary">
                ${totalAmount.toFixed(2)}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={4}>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="subtitle2" color="text.secondary">
                Total Paid
              </Typography>
              <Typography variant="h4" color="success.main">
                ${totalPaid.toFixed(2)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {percentPaid.toFixed(0)}% paid
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} sm={4}>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="subtitle2" color="text.secondary">
                Balance Remaining
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  color: remainingBalance > 0 ? "error.main" : "success.main",
                  fontWeight: 700,
                }}
              >
                ${remainingBalance.toFixed(2)}
              </Typography>
              {remainingBalance <= 0 && (
                <Chip
                  icon={<CheckCircleIcon />}
                  label="PAID IN FULL"
                  color="success"
                  sx={{ mt: 1 }}
                />
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* NEW: Payment Plan Status */}
      {paymentPlanStatus && (
        <Paper sx={{ p: 3, mb: 3, bgcolor: "#e3f2fd", border: "2px solid #2196f3" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <ScheduleIcon color="primary" />
            <Typography variant="h6" color="primary">
              Payment Plan Active
            </Typography>
          </Box>
          
          <Grid container spacing={2}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">
                Frequency
              </Typography>
              <Typography variant="body1" fontWeight="bold" sx={{ textTransform: "capitalize" }}>
                {paymentPlanStatus.frequency}
              </Typography>
            </Grid>
            
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">
                Progress
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                {paymentPlanStatus.paymentsMade} of {paymentPlanStatus.totalPayments}
              </Typography>
            </Grid>
            
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">
                Installment Amount
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                ${parseFloat(paymentPlanStatus.installmentAmount).toFixed(2)}
              </Typography>
            </Grid>
            
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="text.secondary">
                Next Due
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                {paymentPlanStatus.nextDueDate 
                  ? moment(paymentPlanStatus.nextDueDate).format("MMM DD, YYYY")
                  : "Complete!"}
              </Typography>
            </Grid>
          </Grid>

          {/* Payment Schedule Table */}
          {paymentPlanStatus.schedule && paymentPlanStatus.schedule.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                📅 Payment Schedule:
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>Due Date</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paymentPlanStatus.schedule.map((scheduled, idx) => {
                    const isPaid = payments.some(p => 
                      moment(p.paymentDate).format("YYYY-MM-DD") === moment(scheduled.dueDate).format("YYYY-MM-DD")
                    );
                    const isOverdue = !isPaid && moment(scheduled.dueDate).isBefore(moment(), 'day');
                    
                    return (
                      <TableRow key={idx}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>{moment(scheduled.dueDate).format("MMM DD, YYYY")}</TableCell>
                        <TableCell align="right">${parseFloat(scheduled.amount).toFixed(2)}</TableCell>
                        <TableCell>
                          {isPaid ? (
                            <Chip label="Paid" color="success" size="small" icon={<CheckCircleIcon />} />
                          ) : isOverdue ? (
                            <Chip label="Overdue" color="error" size="small" />
                          ) : (
                            <Chip label="Pending" color="warning" size="small" icon={<PendingIcon />} />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </Paper>
      )}

      {/* Payment History */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Payment History ({payments.length})
        </Typography>

        {payments.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            No payments recorded yet. Click "Add Payment" to record the first payment.
          </Alert>
        ) : (
          <Timeline position={isMobile ? "right" : "alternate"}>
            {payments.map((payment, index) => (
              <TimelineItem key={payment.id}>
                {!isMobile && (
                  <TimelineOppositeContent color="text.secondary">
                    {moment(payment.paymentDate).format("MMM DD, YYYY")}
                  </TimelineOppositeContent>
                )}
                <TimelineSeparator>
                  <TimelineDot color="success">
                    <PaymentIcon />
                  </TimelineDot>
                  {index < payments.length - 1 && <TimelineConnector />}
                </TimelineSeparator>
                <TimelineContent>
                  <Card sx={{ mb: 2 }}>
                    <CardContent>
                      {isMobile && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {moment(payment.paymentDate).format("MMM DD, YYYY")}
                        </Typography>
                      )}
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                        <Box>
                          <Typography variant="h6" color="success.main">
                            ${parseFloat(payment.amount).toFixed(2)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {getPaymentMethodIcon(payment.paymentMethod)}{" "}
                            {getPaymentMethodLabel(payment.paymentMethod)}
                          </Typography>
                          {payment.reference && (
                            <Typography variant="body2" color="text.secondary">
                              Ref: {payment.reference}
                            </Typography>
                          )}
                          {payment.notes && (
                            <Typography variant="body2" sx={{ mt: 1 }}>
                              {payment.notes}
                            </Typography>
                          )}
                        </Box>
                        
                        {/* NEW: Edit and Delete buttons */}
                        <Box sx={{ display: "flex", gap: 1 }}>
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={() => openEditDialog(payment)}
                            title="Edit Payment"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            color="error"
                            onClick={() => handleDeletePayment(payment)}
                            title="Delete Payment"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </Box>
                      
                      {payment.receiptGenerated && (
                        <Chip
                          icon={<ReceiptIcon />}
                          label="Receipt Generated"
                          size="small"
                          sx={{ mt: 1 }}
                        />
                      )}
                    </CardContent>
                  </Card>
                </TimelineContent>
              </TimelineItem>
            ))}
          </Timeline>
        )}
      </Paper>

      {/* Add Payment Dialog */}
      <Dialog open={addPaymentOpen} onClose={() => setAddPaymentOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Record Payment</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField
              label="Payment Amount"
              type="number"
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
              fullWidth
              required
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
              inputProps={{ min: 0, step: "0.01" }}
              helperText={`Remaining balance: $${remainingBalance.toFixed(2)}`}
            />

            <TextField
              select
              label="Payment Method"
              value={paymentForm.paymentMethod}
              onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
              fullWidth
            >
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="check">Check</MenuItem>
              <MenuItem value="zelle">Zelle (Preferred)</MenuItem>
              <MenuItem value="credit_card">Credit Card</MenuItem>
              <MenuItem value="venmo">Venmo</MenuItem>
              <MenuItem value="paypal">PayPal</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>

            <TextField
              label="Payment Date"
              type="date"
              value={paymentForm.paymentDate}
              onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Reference/Check Number (Optional)"
              value={paymentForm.reference}
              onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
              fullWidth
            />

            <TextField
              label="Notes (Optional)"
              value={paymentForm.notes}
              onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={paymentForm.generateReceipt}
                  onChange={(e) =>
                    setPaymentForm({ ...paymentForm, generateReceipt: e.target.checked })
                  }
                />
              }
              label="Generate and view receipt"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddPaymentOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddPayment}>
            Record Payment
          </Button>
        </DialogActions>
      </Dialog>

      {/* NEW: Edit Payment Dialog */}
      <Dialog open={editPaymentOpen} onClose={() => setEditPaymentOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Payment</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField
              label="Payment Amount"
              type="number"
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
              fullWidth
              required
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>,
              }}
              inputProps={{ min: 0, step: "0.01" }}
            />

            <TextField
              select
              label="Payment Method"
              value={paymentForm.paymentMethod}
              onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
              fullWidth
            >
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="check">Check</MenuItem>
              <MenuItem value="zelle">Zelle (Preferred)</MenuItem>
              <MenuItem value="credit_card">Credit Card</MenuItem>
              <MenuItem value="venmo">Venmo</MenuItem>
              <MenuItem value="paypal">PayPal</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>

            <TextField
              label="Payment Date"
              type="date"
              value={paymentForm.paymentDate}
              onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Reference/Check Number (Optional)"
              value={paymentForm.reference}
              onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
              fullWidth
            />

            <TextField
              label="Notes (Optional)"
              value={paymentForm.notes}
              onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditPaymentOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEditPayment}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}