import React, { useEffect, useState } from "react";
import { collection, getDocs, deleteDoc, doc, updateDoc, addDoc, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { generateSecureToken } from './utils/tokenUtils';
import {
  Box,
  Typography,
  Paper,
  Button,
  Card,
  CardContent,
  CardActions,
  Chip,
  Grid,
  IconButton,
  useMediaQuery,
  useTheme,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ReceiptIcon from "@mui/icons-material/Receipt";
import PaymentIcon from "@mui/icons-material/Payment";
import moment from "moment";
import { 
  createMaintenanceSchedules,
  getExistingMaintenanceSchedules,
  getNextVisitDate,
  regenerateMaintenanceSchedules,
  deleteMaintenanceSchedules
} from "./maintenanceScheduler";

export default function MaintenanceDashboard() {
  const [contracts, setContracts] = useState([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [paymentDialog, setPaymentDialog] = useState({ open: false, contract: null });
  const [paymentData, setPaymentData] = useState({
    amount: '',
    method: 'Cash',
    notes: '',
    createInvoice: false
  });
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  useEffect(() => {
    fetchContracts();
  }, []);

  const fetchContracts = async () => {
    try {
      const snap = await getDocs(collection(db, "maintenance_contracts"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      
      // Load schedule information for each contract
      const contractsWithSchedules = await Promise.all(
        data.map(async (contract) => {
          try {
            const schedules = await getExistingMaintenanceSchedules(contract.id);
            const nextVisit = await getNextVisitDate(contract.id);
            
            // Count future scheduled visits
            const futureSchedules = schedules.filter(s => 
              moment(s.startDate).isSameOrAfter(moment(), 'day') && 
              s.status !== 'cancelled' &&
              s.status !== 'completed'
            );
            
            return {
              ...contract,
              scheduledVisitsCount: futureSchedules.length,
              nextVisitDate: nextVisit,
              totalSchedules: schedules.length
            };
          } catch (error) {
            console.error(`Error loading schedules for ${contract.customerName}:`, error);
            return contract;
          }
        })
      );
      
      // Sort by status (active first) then by customer name
      contractsWithSchedules.sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (a.status !== "active" && b.status === "active") return 1;
        return (a.customerName || "").localeCompare(b.customerName || "");
      });
      
      setContracts(contractsWithSchedules);
    } catch (error) {
      console.error("Error fetching maintenance contracts:", error);
      Swal.fire("Error", "Failed to load maintenance contracts", "error");
    }
  };

  const handleDelete = async (id, customerName) => {
    const result = await Swal.fire({
      title: `Delete Maintenance Contract?`,
      text: `Remove ${customerName}'s maintenance agreement?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      confirmButtonColor: "#d33",
    });

    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, "maintenance_contracts", id));
        setContracts(contracts.filter((c) => c.id !== id));
        Swal.fire("Deleted!", "Maintenance contract removed", "success");
      } catch (error) {
        console.error("Error deleting contract:", error);
        Swal.fire("Error", "Failed to delete contract", "error");
      }
    }
  };

  const handleToggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    
    try {
      await updateDoc(doc(db, "maintenance_contracts", id), {
        status: newStatus,
      });
      
      setContracts(contracts.map((c) =>
        c.id === id ? { ...c, status: newStatus } : c
      ));
      
      Swal.fire({
        title: newStatus === "active" ? "Resumed!" : "Paused!",
        text: `Maintenance contract ${newStatus === "active" ? "resumed" : "paused"}`,
        icon: "success",
        timer: 2000,
      });
    } catch (error) {
      console.error("Error updating status:", error);
      Swal.fire("Error", "Failed to update status", "error");
    }
  };

  const handleRegenerateSchedules = async (contract) => {
    const result = await Swal.fire({
      title: 'Regenerate Schedules?',
      html: `This will create new maintenance visits for <strong>${contract.customerName}</strong> based on the contract frequency.<br><br>Existing future visits will be kept.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Regenerate',
      confirmButtonColor: '#1976d2',
    });

    if (result.isConfirmed) {
      try {
        Swal.fire({
          title: 'Creating Schedules...',
          text: 'Please wait',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        const schedulesCreated = await createMaintenanceSchedules(contract, contract.monthsAhead || 3);
        
        // Refresh contracts to show new schedule counts
        await fetchContracts();
        
        Swal.fire({
          title: 'Schedules Created!',
          html: `<strong>${schedulesCreated}</strong> new visits scheduled for ${contract.customerName}`,
          icon: 'success',
        });
      } catch (error) {
        console.error('Error regenerating schedules:', error);
        Swal.fire('Error', 'Failed to regenerate schedules: ' + error.message, 'error');
      }
    }
  };

  const handleCreateInvoice = async (contract) => {
    try {
      // Lookup customerId if not present
      let customerId = contract.customerId || null;
      if (!customerId && contract.customerName) {
        try {
          const customersQuery = query(
            collection(db, 'customers'),
            where('name', '==', contract.customerName)
          );
          const customersSnap = await getDocs(customersQuery);
          if (!customersSnap.empty) {
            customerId = customersSnap.docs[0].id;
          }
        } catch (err) {
          console.warn('Failed to lookup customer by name:', err);
        }
      }

      // Build service description
      const description = `Monthly Maintenance - ${getFrequencyDisplay(contract.frequency)}\n${contract.servicesIncluded || 'Standard maintenance service'}`;

      const invoiceData = {
        customerId: customerId,
        clientName: contract.customerName,
        customerName: contract.customerName,
        clientAddress: contract.customerAddress || '',
        clientPhone: contract.customerPhone || '',
        clientEmail: contract.customerEmail || '',
        description: description,
        lineItems: [{
          description: contract.servicesIncluded || 'Monthly maintenance service',
          amount: parseFloat(contract.monthlyRate || 0)
        }],
        subtotal: parseFloat(contract.monthlyRate || 0),
        total: parseFloat(contract.monthlyRate || 0),
        tax: 0,
        status: 'Sent',
        invoiceDate: moment().format('YYYY-MM-DD'),
        createdAt: new Date().toISOString(),
        maintenanceContractId: contract.id,
        type: 'maintenance',
        paymentToken: generateSecureToken(),
      };

      const invoiceRef = await addDoc(collection(db, 'invoices'), invoiceData);

      Swal.fire({
        icon: 'success',
        title: 'Invoice Created!',
        text: `$${contract.monthlyRate} invoice for ${contract.customerName}`,
        timer: 2000,
        showConfirmButton: false,
      });

      // Navigate to edit the new invoice
      navigate(`/invoice/${invoiceRef.id}`);

    } catch (error) {
      console.error('Error creating maintenance invoice:', error);
      Swal.fire('Error', 'Failed to create invoice: ' + error.message, 'error');
    }
  };

  const handleCollectPayment = (contract) => {
    setPaymentDialog({ open: true, contract });
    setPaymentData({
      amount: contract.monthlyRate || '',
      method: 'Cash',
      notes: `Monthly maintenance payment for ${moment().format('MMMM YYYY')}`,
      createInvoice: false
    });
  };

  const handleSavePayment = async () => {
    if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
      Swal.fire('Error', 'Please enter a valid amount', 'error');
      return;
    }

    try {
      const contract = paymentDialog.contract;
      
      // Lookup customerId if not present on contract
      let customerId = contract.customerId || null;
      if (!customerId && contract.customerName) {
        try {
          const customersQuery = query(
            collection(db, 'customers'),
            where('name', '==', contract.customerName)
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
      const paymentRecord = {
        customerId: customerId,
        clientName: contract.customerName,
        customerName: contract.customerName,
        amount: parseFloat(paymentData.amount),
        paymentMethod: paymentData.method,
        paymentDate: new Date().toISOString(),
        notes: paymentData.notes,
        status: 'completed',
        createdAt: new Date().toISOString(),
        maintenanceContractId: contract.id,
        type: 'maintenance'
      };

      await addDoc(collection(db, 'payments'), paymentRecord);

      // Optionally create invoice
      if (paymentData.createInvoice) {
        const invoiceData = {
          customerId: customerId,
          clientName: contract.customerName,
          customerName: contract.customerName,
          description: `Monthly Maintenance - ${getFrequencyDisplay(contract.frequency)}`,
          lineItems: [{
            description: contract.servicesIncluded || 'Monthly maintenance service',
            amount: parseFloat(paymentData.amount)
          }],
          subtotal: parseFloat(paymentData.amount),
          total: parseFloat(paymentData.amount),
          status: 'Paid',
          paidAt: new Date().toISOString(),
          paidAmount: parseFloat(paymentData.amount),
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          maintenanceContractId: contract.id,
          type: 'maintenance',
          paymentToken: generateSecureToken(),
        };

        await addDoc(collection(db, 'invoices'), invoiceData);
      }

      Swal.fire({
        icon: 'success',
        title: 'Payment Recorded!',
        html: `
          <p><strong>Customer:</strong> ${contract.customerName}</p>
          <p><strong>Amount:</strong> $${paymentData.amount}</p>
          <p><strong>Method:</strong> ${paymentData.method}</p>
          ${paymentData.createInvoice ? '<p>Invoice created</p>' : ''}
        `,
        timer: 3000
      });

      setPaymentDialog({ open: false, contract: null });
      setPaymentData({ amount: '', method: 'Cash', notes: '', createInvoice: false });

    } catch (error) {
      console.error('Error recording payment:', error);
      Swal.fire('Error', 'Failed to record payment', 'error');
    }
  };

  const getFrequencyDisplay = (frequency) => {
    switch (frequency) {
      case "weekly": return "Weekly";
      case "biweekly": return "Every 2 Weeks";
      case "monthly": return "Monthly";
      default: return frequency;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "active": return "success";
      case "paused": return "warning";
      case "cancelled": return "error";
      default: return "default";
    }
  };

  const filteredContracts = contracts.filter((contract) => {
    if (filterStatus === "all") return true;
    return contract.status === filterStatus;
  });

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h5" sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}>
          Monthly Maintenance ({filteredContracts.length})
        </Typography>

        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Filter</InputLabel>
            <Select
              value={filterStatus}
              label="Filter"
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <MenuItem value="all">All Contracts</MenuItem>
              <MenuItem value="active">Active Only</MenuItem>
              <MenuItem value="paused">Paused Only</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate("/maintenance/new")}
            sx={{ whiteSpace: "nowrap" }}
          >
            {isMobile ? "Add" : "New Contract"}
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: "center", bgcolor: "#e8f5e9" }}>
            <Typography variant="h4" color="success.main">
              {contracts.filter((c) => c.status === "active").length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Active Contracts
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: "center", bgcolor: "#fff3e0" }}>
            <Typography variant="h4" color="warning.main">
              {contracts.filter((c) => c.status === "paused").length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Paused
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: "center", bgcolor: "#e3f2fd" }}>
            <Typography variant="h4" color="primary.main">
              ${contracts
                .filter((c) => c.status === "active")
                .reduce((sum, c) => sum + (parseFloat(c.monthlyRate) || 0), 0)
                .toFixed(0)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Monthly Revenue
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: "center", bgcolor: "#fce4ec" }}>
            <Typography variant="h4" color="error.main">
              {contracts.filter((c) => c.status === "cancelled").length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Cancelled
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Empty State */}
      {filteredContracts.length === 0 && (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <CalendarMonthIcon sx={{ fontSize: 80, color: "text.secondary", mb: 2 }} />
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            No Maintenance Contracts Yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create recurring maintenance agreements for steady monthly revenue
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate("/maintenance/new")}
          >
            Create First Contract
          </Button>
        </Paper>
      )}

      {/* Contracts Grid */}
      <Grid container spacing={2}>
        {filteredContracts.map((contract) => (
          <Grid item xs={12} md={6} lg={4} key={contract.id}>
            <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <CardContent sx={{ flexGrow: 1 }}>
                {/* Status and Frequency */}
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
                  <Chip
                    label={contract.status || "active"}
                    color={getStatusColor(contract.status)}
                    size="small"
                    sx={{ fontWeight: "bold", textTransform: "capitalize" }}
                  />
                  <Chip
                    label={getFrequencyDisplay(contract.frequency)}
                    variant="outlined"
                    size="small"
                  />
                </Box>

                {/* Customer Name */}
                <Typography variant="h6" gutterBottom>
                  {contract.customerName}
                </Typography>

                {/* Monthly Rate */}
                <Typography variant="h5" color="primary" sx={{ mb: 2, fontWeight: "bold" }}>
                  ${contract.monthlyRate}/mo
                </Typography>

                {/* Services */}
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  <strong>Services:</strong>
                  <br />
                  {contract.servicesIncluded || "Standard maintenance"}
                </Typography>

                {/* Schedule Info */}
                <Box sx={{ mb: 1, p: 1, bgcolor: "#f5f5f5", borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    <strong>Next Visit:</strong> {contract.nextVisitDate ? moment(contract.nextVisitDate).format("MMM DD, YYYY") : "Not scheduled"}
                  </Typography>
                  <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>
                    {contract.scheduledVisitsCount || 0} visits scheduled ahead
                  </Typography>
                </Box>

                {/* Start Date */}
                <Typography variant="caption" color="text.secondary">
                  Started: {moment(contract.startDate).format("MMM DD, YYYY")}
                </Typography>
              </CardContent>

              <CardActions sx={{ p: 2, pt: 0, flexWrap: "wrap", gap: 1 }}>
                <Button
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={() => navigate(`/maintenance/${contract.id}`)}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  startIcon={<CalendarMonthIcon />}
                  onClick={() => handleRegenerateSchedules(contract)}
                  color="info"
                  disabled={contract.status !== 'active'}
                >
                  Schedules
                </Button>
                <Button
                  size="small"
                  startIcon={contract.status === "active" ? <PauseIcon /> : <PlayArrowIcon />}
                  onClick={() => handleToggleStatus(contract.id, contract.status)}
                  color={contract.status === "active" ? "warning" : "success"}
                >
                  {contract.status === "active" ? "Pause" : "Resume"}
                </Button>
                <Button
                  size="small"
                  startIcon={<ReceiptIcon />}
                  onClick={() => handleCreateInvoice(contract)}
                  color="success"
                >
                  Invoice
                </Button>
                <Button
                  size="small"
                  startIcon={<PaymentIcon />}
                  onClick={() => handleCollectPayment(contract)}
                  color="success"
                  variant="contained"
                >
                  Pay
                </Button>
                <Button
                  size="small"
                  startIcon={<DeleteIcon />}
                  onClick={() => handleDelete(contract.id, contract.customerName)}
                  color="error"
                >
                  Delete
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Payment Collection Dialog */}
      <Dialog
        open={paymentDialog.open}
        onClose={() => setPaymentDialog({ open: false, contract: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Collect Payment - {paymentDialog.contract?.customerName}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Amount"
              type="number"
              value={paymentData.amount}
              onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
              fullWidth
              InputProps={{
                startAdornment: <Typography>$</Typography>
              }}
            />

            <FormControl fullWidth>
              <InputLabel>Payment Method</InputLabel>
              <Select
                value={paymentData.method}
                label="Payment Method"
                onChange={(e) => setPaymentData({ ...paymentData, method: e.target.value })}
              >
                <MenuItem value="Cash">Cash</MenuItem>
                <MenuItem value="Check">Check</MenuItem>
                <MenuItem value="Zelle">Zelle</MenuItem>
                <MenuItem value="Card">Card</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Notes"
              value={paymentData.notes}
              onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={paymentData.createInvoice}
                  onChange={(e) => setPaymentData({ ...paymentData, createInvoice: e.target.checked })}
                />
              }
              label="Also create invoice record"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialog({ open: false, contract: null })}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSavePayment}>
            Record Payment
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}