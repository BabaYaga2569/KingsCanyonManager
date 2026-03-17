import React, { useState, useEffect } from "react";
import { collection, getDocs, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "./firebase";
import {
  Container,
  Typography,
  Box,
  Paper,
  TextField,
  MenuItem,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  useMediaQuery,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DownloadIcon from "@mui/icons-material/Download";
import { exportCrewPaymentsToExcel } from './utils/kclExportUtils';
import ReceiptIcon from "@mui/icons-material/Receipt";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseIcon from "@mui/icons-material/Close";
import moment from "moment";
import { useNavigate } from "react-router-dom";
import generateCrewPaymentReceipt from "./pdf/generateCrewPaymentReceipt";
import Swal from "sweetalert2";

export default function CrewPaymentHistory() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState([]);
  const [crews, setCrews] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [filters, setFilters] = useState({
    crewId: "all",
    startDate: moment().subtract(90, "days").format("YYYY-MM-DD"),
    endDate: moment().format("YYYY-MM-DD"),
    paymentMethod: "all",
  });

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const paymentsSnap = await getDocs(collection(db, "crew_payments"));
      const paymentsData = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPayments(paymentsData);

      const crewsSnap = await getDocs(collection(db, "crews"));
      const crewsData = crewsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCrews(crewsData);

      const jobsSnap = await getDocs(collection(db, "jobs"));
      const jobsData = jobsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setJobs(jobsData);

      setLoading(false);
    } catch (error) {
      console.error("Error loading payment history:", error);
      setLoading(false);
    }
  };

  const getFilteredPayments = () => {
    return payments.filter((payment) => {
      const paymentDate = moment(payment.paymentDate);
      const inDateRange =
        paymentDate.isSameOrAfter(moment(filters.startDate)) &&
        paymentDate.isSameOrBefore(moment(filters.endDate));

      const matchesCrew = filters.crewId === "all" || payment.crewId === filters.crewId;
      const matchesMethod =
        filters.paymentMethod === "all" || payment.paymentMethod === filters.paymentMethod;

      return inDateRange && matchesCrew && matchesMethod;
    });
  };

  const getTotalPaid = () => {
    return getFilteredPayments().reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  };

  const handleExportCSV = () => {
    const filtered = getFilteredPayments();
    const csvContent = [
      ["Date", "Crew Member", "Job", "Hours", "Rate", "Amount", "Method", "Reference", "Notes"].join(","),
      ...filtered.map((p) =>
        [
          p.paymentDate,
          `"${p.crewName}"`,
          `"${p.jobName}"`,
          p.hoursWorked || 0,
          p.hourlyRate || 0,
          p.amount,
          p.paymentMethod,
          p.referenceNumber || "",
          `"${p.notes || ""}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crew-payments-${moment().format("YYYY-MM-DD")}.csv`;
    a.click();
  };

  const handleViewReceipt = async (payment) => {
    try {
      const pdf = await generateCrewPaymentReceipt(payment);
      const pdfBlob = pdf.output("blob");
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, "_blank");
    } catch (error) {
      console.error("Error generating receipt:", error);
      Swal.fire("Error", "Failed to generate receipt", "error");
    }
  };

  // EDIT FUNCTIONS
  const handleEditClick = (payment) => {
    setEditingPayment(payment);
    setEditForm({
      crewId: payment.crewId,
      crewName: payment.crewName,
      jobId: payment.jobId || "",
      jobName: payment.jobName,
      paymentDate: payment.paymentDate,
      hoursWorked: payment.hoursWorked || "",
      hourlyRate: payment.hourlyRate || "",
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.referenceNumber || "",
      notes: payment.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditFormChange = (field, value) => {
    const newForm = { ...editForm, [field]: value };

    // Auto-calculate amount if hours or rate changes
    if (field === "hoursWorked" || field === "hourlyRate") {
      const hours = parseFloat(field === "hoursWorked" ? value : newForm.hoursWorked) || 0;
      const rate = parseFloat(field === "hourlyRate" ? value : newForm.hourlyRate) || 0;
      newForm.amount = (hours * rate).toFixed(2);
    }

    // Update crew name when crew is selected
    if (field === "crewId") {
      const selectedCrew = crews.find((c) => c.id === value);
      if (selectedCrew) {
        newForm.crewName = selectedCrew.name;
      }
    }

    // Update job name when job is selected
    if (field === "jobId") {
      const selectedJob = jobs.find((j) => j.id === value);
      if (selectedJob) {
        newForm.jobName = selectedJob.customerName || selectedJob.jobName || "Unknown Job";
      }
    }

    setEditForm(newForm);
  };

  const handleSaveEdit = async () => {
    try {
      if (!editForm.crewId || !editForm.amount || !editForm.paymentDate) {
        Swal.fire("Missing Info", "Crew, amount, and date are required", "warning");
        return;
      }

      const paymentRef = doc(db, "crew_payments", editingPayment.id);
      await updateDoc(paymentRef, {
        crewId: editForm.crewId,
        crewName: editForm.crewName,
        jobId: editForm.jobId,
        jobName: editForm.jobName,
        paymentDate: editForm.paymentDate,
        hoursWorked: parseFloat(editForm.hoursWorked) || 0,
        hourlyRate: parseFloat(editForm.hourlyRate) || 0,
        amount: parseFloat(editForm.amount),
        paymentMethod: editForm.paymentMethod,
        referenceNumber: editForm.referenceNumber,
        notes: editForm.notes,
        updatedAt: new Date().toISOString(),
      });

      // Update local state
      setPayments(payments.map((p) =>
        p.id === editingPayment.id ? { ...p, ...editForm, amount: parseFloat(editForm.amount) } : p
      ));

      setEditDialogOpen(false);
      Swal.fire("Success", "Payment updated successfully", "success");
    } catch (error) {
      console.error("Error updating payment:", error);
      Swal.fire("Error", "Failed to update payment", "error");
    }
  };

  // DELETE FUNCTION
  const handleDelete = async (payment) => {
    const result = await Swal.fire({
      title: "Delete Payment?",
      html: `
        Are you sure you want to delete this payment?<br><br>
        <strong>${payment.crewName}</strong><br>
        ${moment(payment.paymentDate).format("MMM DD, YYYY")}<br>
        <strong style="color: #d32f2f;">$${parseFloat(payment.amount).toFixed(2)}</strong>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d32f2f",
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });

    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, "crew_payments", payment.id));
        setPayments(payments.filter((p) => p.id !== payment.id));
        Swal.fire("Deleted!", "Payment has been deleted.", "success");
      } catch (error) {
        console.error("Error deleting payment:", error);
        Swal.fire("Error", "Failed to delete payment", "error");
      }
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading payment history...</Typography>
      </Container>
    );
  }

  const filteredPayments = getFilteredPayments();

  return (
    <Container sx={{ mt: 3, pb: 4 }}>
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton onClick={() => navigate("/crew-payroll")} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}>
            💰 Crew Payment History
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => exportCrewPaymentsToExcel(filteredPayments)}
            size={isMobile ? "small" : "medium"}
          >
            Excel
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportCSV}
            size={isMobile ? "small" : "medium"}
          >
            CSV
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Total Paid (Filtered)
              </Typography>
              <Typography variant="h4" color="error.main">
                ${getTotalPaid().toFixed(2)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {filteredPayments.length} payments
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Average Payment
              </Typography>
              <Typography variant="h4" color="info.main">
                ${filteredPayments.length > 0 ? (getTotalPaid() / filteredPayments.length).toFixed(2) : "0.00"}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                per payment
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Total Hours
              </Typography>
              <Typography variant="h4" color="success.main">
                {filteredPayments.reduce((sum, p) => sum + (parseFloat(p.hoursWorked) || 0), 0).toFixed(1)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                hours worked
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Filters
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              label="Start Date"
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              label="End Date"
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              label="Crew Member"
              value={filters.crewId}
              onChange={(e) => setFilters({ ...filters, crewId: e.target.value })}
              fullWidth
              size="small"
            >
              <MenuItem value="all">All Crew Members</MenuItem>
              {crews.map((crew) => (
                <MenuItem key={crew.id} value={crew.id}>
                  {crew.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              select
              label="Payment Method"
              value={filters.paymentMethod}
              onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
              fullWidth
              size="small"
            >
              <MenuItem value="all">All Methods</MenuItem>
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="check">Check</MenuItem>
              <MenuItem value="zelle">Zelle</MenuItem>
              <MenuItem value="venmo">Venmo</MenuItem>
              <MenuItem value="paypal">PayPal</MenuItem>
              <MenuItem value="direct_deposit">Direct Deposit</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* Payments List */}
      {isMobile ? (
        <Box>
          {filteredPayments
            .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))
            .map((payment) => (
              <Card key={payment.id} sx={{ mb: 2 }}>
                <CardContent>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                    <Typography variant="h6">{payment.crewName}</Typography>
                    <Typography variant="h6" color="error.main">
                      ${parseFloat(payment.amount).toFixed(2)}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {moment(payment.paymentDate).format("MMM DD, YYYY")}
                  </Typography>
                  <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <Chip label={payment.paymentMethod} size="small" />
                    {payment.hoursWorked && (
                      <Chip label={`${payment.hoursWorked} hrs`} size="small" color="info" />
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Job: {payment.jobName}
                  </Typography>
                  {payment.notes && (
                    <Typography variant="body2" color="text.secondary">
                      {payment.notes}
                    </Typography>
                  )}
                  <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="info"
                      startIcon={<EditIcon />}
                      onClick={() => handleEditClick(payment)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => handleDelete(payment)}
                    >
                      Delete
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ReceiptIcon />}
                      onClick={() => handleViewReceipt(payment)}
                    >
                      Receipt
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            ))}
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                <TableCell>Date</TableCell>
                <TableCell>Crew Member</TableCell>
                <TableCell>Job</TableCell>
                <TableCell>Hours</TableCell>
                <TableCell>Rate</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredPayments
                .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))
                .map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{moment(payment.paymentDate).format("MMM DD, YYYY")}</TableCell>
                    <TableCell>{payment.crewName}</TableCell>
                    <TableCell>{payment.jobName}</TableCell>
                    <TableCell>{payment.hoursWorked || "—"}</TableCell>
                    <TableCell>${payment.hourlyRate || "—"}</TableCell>
                    <TableCell align="right">
                      <Typography fontWeight="bold" color="error.main">
                        ${parseFloat(payment.amount).toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={payment.paymentMethod} size="small" />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          color="info"
                          onClick={() => handleEditClick(payment)}
                          title="Edit"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(payment)}
                          title="Delete"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleViewReceipt(payment)}
                          title="Receipt"
                        >
                          <ReceiptIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Edit Payment Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Edit Payment
            <IconButton onClick={() => setEditDialogOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                select
                label="Crew Member"
                value={editForm.crewId || ""}
                onChange={(e) => handleEditFormChange("crewId", e.target.value)}
                fullWidth
                required
              >
                {crews.map((crew) => (
                  <MenuItem key={crew.id} value={crew.id}>
                    {crew.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                select
                label="Job (Optional)"
                value={editForm.jobId || ""}
                onChange={(e) => handleEditFormChange("jobId", e.target.value)}
                fullWidth
              >
                <MenuItem value="">None</MenuItem>
                {jobs.map((job) => (
                  <MenuItem key={job.id} value={job.id}>
                    {job.customerName || job.jobName || "Unknown Job"}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Payment Date"
                type="date"
                value={editForm.paymentDate || ""}
                onChange={(e) => handleEditFormChange("paymentDate", e.target.value)}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Hours Worked"
                type="number"
                value={editForm.hoursWorked || ""}
                onChange={(e) => handleEditFormChange("hoursWorked", e.target.value)}
                fullWidth
                inputProps={{ min: 0, step: 0.5 }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="Hourly Rate"
                type="number"
                value={editForm.hourlyRate || ""}
                onChange={(e) => handleEditFormChange("hourlyRate", e.target.value)}
                fullWidth
                inputProps={{ min: 0, step: 0.5 }}
                InputProps={{ startAdornment: "$" }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Total Amount"
                type="number"
                value={editForm.amount || ""}
                onChange={(e) => handleEditFormChange("amount", e.target.value)}
                fullWidth
                required
                inputProps={{ min: 0, step: 0.01 }}
                InputProps={{ startAdornment: "$" }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                select
                label="Payment Method"
                value={editForm.paymentMethod || "cash"}
                onChange={(e) => handleEditFormChange("paymentMethod", e.target.value)}
                fullWidth
                required
              >
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="check">Check</MenuItem>
                <MenuItem value="zelle">Zelle</MenuItem>
                <MenuItem value="venmo">Venmo</MenuItem>
                <MenuItem value="paypal">PayPal</MenuItem>
                <MenuItem value="direct_deposit">Direct Deposit</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Reference Number (Optional)"
                value={editForm.referenceNumber || ""}
                onChange={(e) => handleEditFormChange("referenceNumber", e.target.value)}
                fullWidth
                placeholder="Check #, Transaction ID, etc."
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes (Optional)"
                value={editForm.notes || ""}
                onChange={(e) => handleEditFormChange("notes", e.target.value)}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={handleSaveEdit} variant="contained" color="primary">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}