import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  Container,
  Typography,
  TextField,
  Button,
  Box,
  Paper,
  MenuItem,
  Alert,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import Swal from "sweetalert2";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import moment from "moment";
import { generateSecureToken } from './utils/tokenUtils';
import { 
  createMaintenanceSchedules, 
  deleteMaintenanceSchedules,
  updateMaintenanceScheduleStatus 
} from "./maintenanceScheduler";

export default function MaintenanceEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "new";

  const [contract, setContract] = useState({
    customerId: "",
    customerName: "",
    frequency: "biweekly",
    monthlyRate: "",
    servicesIncluded: "Routine maintenance including trimming, hedging, mowing, checking timers. Additional items like rock installation, landscape work, or irrigation repairs will be billed separately.",
    startDate: "",
    status: "pending_signature",
    notes: "",
    autoSchedule: true, // NEW: Enable auto-scheduling by default
    monthsAhead: 3, // NEW: How many months ahead to schedule
  });

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Quick Add Customer state
  const [addCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
  });

  useEffect(() => {
    fetchCustomers();
    if (!isNew) {
      fetchContract();
    }
  }, [id]);

  const fetchCustomers = async () => {
    try {
      const snap = await getDocs(collection(db, "customers"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setCustomers(data);
    } catch (error) {
      console.error("Error fetching customers:", error);
    }
  };

  const fetchContract = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, "maintenance_contracts", id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        setContract(snap.data());
      } else {
        Swal.fire("Not found", "Contract not found", "error");
        navigate("/maintenance");
      }
    } catch (error) {
      console.error("Error loading contract:", error);
      Swal.fire("Error", "Failed to load contract", "error");
      navigate("/maintenance");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setContract({ ...contract, [name]: value });
  };

  const handleCustomerSelect = (customerId) => {
    const customer = customers.find((c) => c.id === customerId);
    setContract({
      ...contract,
      customerId,
      customerName: customer ? customer.name : "",
    });
  };

  const handleQuickAddCustomer = async () => {
    if (!newCustomer.name || newCustomer.name.trim() === "") {
      Swal.fire("Error", "Customer name is required", "error");
      return;
    }

    try {
      const customerData = {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
        email: newCustomer.email.trim(),
        address: newCustomer.address.trim(),
        createdAt: serverTimestamp(),
        lifetimeValue: 0,
        contractCount: 0,
        bidCount: 0,
        notes: "Quick-added from maintenance contract",
      };

      const customerRef = await addDoc(collection(db, "customers"), customerData);
      
      // Reload customers and auto-select the new one
      await fetchCustomers();
      
      // Auto-select the newly created customer
      setContract({
        ...contract,
        customerId: customerRef.id,
        customerName: newCustomer.name.trim(),
      });

      // Reset and close
      setNewCustomer({ name: "", phone: "", email: "", address: "" });
      setAddCustomerDialogOpen(false);

      Swal.fire({
        title: "Customer Added!",
        text: `${newCustomer.name} has been added and selected`,
        icon: "success",
        timer: 2000,
      });
    } catch (error) {
      console.error("Error adding customer:", error);
      Swal.fire("Error", "Failed to add customer: " + error.message, "error");
    }
  };

  const handleSave = async () => {
    // Validation
    if (!contract.customerName || contract.customerName.trim() === "") {
      Swal.fire("Error", "Please select a customer", "error");
      return;
    }

    if (!contract.monthlyRate || parseFloat(contract.monthlyRate) <= 0) {
      Swal.fire("Error", "Please enter a valid monthly rate", "error");
      return;
    }

    if (!contract.startDate) {
      // startDate is optional — TBD until contract is signed, that's fine
    }

    setSaving(true);
    try {
      const contractData = {
        ...contract,
        monthlyRate: parseFloat(contract.monthlyRate),
        updatedAt: serverTimestamp(),
      };

      let contractId = id;
      
      if (isNew) {
        contractData.createdAt = serverTimestamp();
        contractData.lastVisitDate = null;
        contractData.totalVisits = 0;
        contractData.status = 'pending_signature'; // Always start pending
        
        const docRef = await addDoc(collection(db, "maintenance_contracts"), contractData);
        contractId = docRef.id;

        // ── Create signing contract in contracts collection ──────────────────
        // This is what shows up in the Contracts dashboard for sending to client
        const signingToken = generateSecureToken();
        const freq = contract.frequency || 'biweekly';
        const freqLabel = freq.charAt(0).toUpperCase() + freq.slice(1);
        await addDoc(collection(db, "contracts"), {
          maintenanceContractId: contractId,
          clientName: contract.customerName || '',
          customerName: contract.customerName || '',
          customerId: contract.customerId || null,
          amount: parseFloat(contract.monthlyRate || 0),
          frequency: freq,
          description: contract.servicesIncluded || 'Standard maintenance service',
          materials: '',
          notes: `Monthly rate: $${contract.monthlyRate}/mo`,
          status: 'Pending',
          type: 'maintenance_agreement',
          signingToken,
          createdAt: new Date().toISOString(),
          source: 'maintenance_contract',
        });

        Swal.fire({
          title: "Maintenance Contract Created!",
          html: `
            <p>Contract for <strong>${contract.customerName}</strong> is ready.</p>
            <p style="margin-top:12px; color:#1565c0;">
              📄 Go to the <strong>Contracts</strong> page to send the signing link to your client.
            </p>
            <p style="margin-top:8px; color:#555; font-size:0.9em;">
              Visits will be scheduled automatically once both parties sign.
            </p>
          `,
          icon: "success",
          confirmButtonText: "Go to Contracts",
          showCancelButton: true,
          cancelButtonText: "Stay Here",
        }).then((result) => {
          if (result.isConfirmed) navigate("/contracts");
          else navigate("/maintenance");
        });
        return; // skip navigate below
      } else {
        const previousStatus = contract.status;
        
        await updateDoc(doc(db, "maintenance_contracts", id), contractData);
        
        // Only create schedules when transitioning TO active from pending/paused
        if (contract.status === "active" && previousStatus !== "active" && contract.autoSchedule) {
          console.log("🔄 Creating maintenance schedules after activation...");
          const schedulesCreated = await createMaintenanceSchedules(
            { ...contractData, id: contractId }, 
            contract.monthsAhead || 3
          );
          Swal.fire({
            title: "Contract Activated!",
            html: `Maintenance contract is now active.<br><strong>${schedulesCreated} visits scheduled on your calendar.</strong>`,
            icon: "success",
          });
        } else if (contract.status === "paused" || contract.status === "cancelled") {
          await updateMaintenanceScheduleStatus(contractId, contract.status);
          Swal.fire({
            title: "Contract Updated!",
            text: `Contract ${contract.status} — future visits updated.`,
            icon: "success",
          });
        } else {
          Swal.fire({
            title: "Contract Updated!",
            text: "Changes saved successfully.",
            icon: "success",
          });
        }
      }

      navigate("/maintenance");
    } catch (error) {
      console.error("Error saving contract:", error);
      Swal.fire("Error", "Failed to save contract: " + error.message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 3 }}>
        <Typography>Loading contract...</Typography>
      </Container>
    );
  }

  return (
    <Container sx={{ mt: 3, mb: 6 }}>
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/maintenance")}
          sx={{ mb: 2 }}
        >
          Back to Maintenance
        </Button>
        <Typography variant="h5">
          {isNew ? "Create Maintenance Contract" : "Edit Maintenance Contract"}
        </Typography>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Contract Information
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
          {/* Customer Selection */}
          <FormControl fullWidth required>
            <InputLabel>Customer</InputLabel>
            <Select
              value={contract.customerId}
              label="Customer"
              onChange={(e) => handleCustomerSelect(e.target.value)}
            >
              {customers.map((customer) => (
                <MenuItem key={customer.id} value={customer.id}>
                  {customer.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Add New Customer Button */}
          <Button
            variant="outlined"
            color="primary"
            startIcon={<PersonAddIcon />}
            onClick={() => setAddCustomerDialogOpen(true)}
            fullWidth
          >
            Add New Customer
          </Button>

          {/* Frequency */}
          <FormControl fullWidth required>
            <InputLabel>Service Frequency</InputLabel>
            <Select
              name="frequency"
              value={contract.frequency}
              label="Service Frequency"
              onChange={handleChange}
            >
              <MenuItem value="weekly">Weekly (4 visits/month)</MenuItem>
              <MenuItem value="biweekly">Every Other Week (2 visits/month)</MenuItem>
              <MenuItem value="monthly">Monthly (1 visit/month)</MenuItem>
            </Select>
          </FormControl>

          {/* Monthly Rate */}
          <TextField
            label="Monthly Rate"
            name="monthlyRate"
            type="number"
            value={contract.monthlyRate}
            onChange={handleChange}
            fullWidth
            required
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
            helperText="Fixed monthly amount customer pays regardless of visits"
          />

          {/* Services Included */}
          <TextField
            label="Services Included"
            name="servicesIncluded"
            value={contract.servicesIncluded}
            onChange={handleChange}
            fullWidth
            required
            multiline
            rows={4}
            helperText="Describe what's included in the maintenance agreement"
          />

          {/* Proposed Start Date */}
          <TextField
            label="Proposed Start Date (Optional)"
            name="startDate"
            type="date"
            value={contract.startDate}
            onChange={handleChange}
            fullWidth
            InputLabelProps={{ shrink: true }}
            helperText="Optional — leave blank if not yet confirmed. Actual start date will be agreed upon after client signs the contract."
          />

          {/* Status */}
          <FormControl fullWidth required>
            <InputLabel>Status</InputLabel>
            <Select
              name="status"
              value={contract.status}
              label="Status"
              onChange={handleChange}
            >
              <MenuItem value="pending_signature">⏳ Awaiting Signature</MenuItem>
              <MenuItem value="active">✅ Active - Scheduled visits</MenuItem>
              <MenuItem value="paused">⏸ Paused - Temporarily stopped</MenuItem>
              <MenuItem value="cancelled">❌ Cancelled - Contract ended</MenuItem>
            </Select>
          </FormControl>

          {/* Auto-Scheduling Options */}
          <Paper sx={{ p: 2, bgcolor: "#f5f5f5", border: "1px solid #e0e0e0" }}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600 }}>
              Auto-Scheduling Settings
            </Typography>
            
            <FormControlLabel
              control={
                <Checkbox
                  checked={contract.autoSchedule}
                  onChange={(e) => setContract({ ...contract, autoSchedule: e.target.checked })}
                  color="primary"
                />
              }
              label="Automatically create scheduled visits"
            />
            
            {contract.autoSchedule && (
              <FormControl fullWidth sx={{ mt: 1 }} size="small">
                <InputLabel>Schedule Ahead</InputLabel>
                <Select
                  name="monthsAhead"
                  value={contract.monthsAhead}
                  label="Schedule Ahead"
                  onChange={handleChange}
                >
                  <MenuItem value={1}>1 Month Ahead</MenuItem>
                  <MenuItem value={2}>2 Months Ahead</MenuItem>
                  <MenuItem value={3}>3 Months Ahead (Recommended)</MenuItem>
                  <MenuItem value={6}>6 Months Ahead</MenuItem>
                </Select>
              </FormControl>
            )}
            
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
              {contract.autoSchedule 
                ? `System will auto-create visits ${contract.monthsAhead} month(s) in advance and add them to your calendar`
                : "Enable to automatically schedule visits based on frequency"}
            </Typography>
          </Paper>

          {/* Notes */}
          <TextField
            label="Internal Notes"
            name="notes"
            value={contract.notes}
            onChange={handleChange}
            fullWidth
            multiline
            rows={3}
            helperText="Private notes (not visible to customer)"
          />
        </Box>
      </Paper>

      {/* Info Alert */}
      <Alert severity="success" sx={{ mb: 3 }}>
        <strong>✨ Auto-Scheduling Enabled!</strong>
        <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
          <li><strong>Automatic:</strong> System creates visits {contract.monthsAhead} month(s) ahead based on frequency</li>
          <li><strong>Calendar:</strong> All visits appear in your Schedule & Calendar automatically</li>
          <li><strong>Smart:</strong> When you complete a visit, next one is auto-scheduled</li>
          <li><strong>Invoice:</strong> Generate monthly invoices for all completed visits</li>
          <li><strong>Flexible:</strong> Pause anytime during off-season - visits stop scheduling</li>
        </ul>
      </Alert>

      {/* Save Button */}
      <Box sx={{ display: "flex", gap: 2 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saving}
          fullWidth
        >
          {saving ? "Saving..." : isNew ? "Create Contract" : "Save Changes"}
        </Button>
        <Button
          variant="outlined"
          size="large"
          onClick={() => navigate("/maintenance")}
          disabled={saving}
        >
          Cancel
        </Button>
      </Box>

      {/* ===================== QUICK ADD CUSTOMER DIALOG ===================== */}
      <Dialog 
        open={addCustomerDialogOpen} 
        onClose={() => setAddCustomerDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ bgcolor: "primary.main", color: "white", display: "flex", alignItems: "center", gap: 1 }}>
          <PersonAddIcon /> Quick Add Customer
        </DialogTitle>
        <DialogContent sx={{ mt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Alert severity="info">
              Add a new customer quickly. Name is required, other fields are optional.
            </Alert>

            <TextField
              label="Customer Name"
              value={newCustomer.name}
              onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
              fullWidth
              required
              autoFocus
              helperText="Required"
            />

            <TextField
              label="Phone Number"
              value={newCustomer.phone}
              onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
              fullWidth
              placeholder="(555) 123-4567"
              helperText="Optional"
            />

            <TextField
              label="Email"
              type="email"
              value={newCustomer.email}
              onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
              fullWidth
              placeholder="customer@email.com"
              helperText="Optional"
            />

            <TextField
              label="Address"
              value={newCustomer.address}
              onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
              fullWidth
              multiline
              rows={2}
              placeholder="123 Main St, Bullhead City, AZ"
              helperText="Optional"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddCustomerDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleQuickAddCustomer}
            startIcon={<PersonAddIcon />}
          >
            Add Customer
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}