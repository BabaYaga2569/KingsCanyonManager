import React, { useState, useEffect } from "react";
import { addDoc, collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { generateSecureToken } from './utils/tokenUtils';
import {
  TextField,
  Button,
  Container,
  Typography,
  Box,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Card,
  CardContent,
  useMediaQuery,
  useTheme,
  Autocomplete,
  Alert,
} from "@mui/material";
import Swal from "sweetalert2";
import { useNavigate } from "react-router-dom";
import DesignVisualizer from "./components/DesignVisualizer";
import BrushIcon from "@mui/icons-material/Brush";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

export default function CreateBid() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();

  // Customer selection state
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Form state — all populated from selected customer, not freehand
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [materials, setMaterials] = useState("");
  const [notes, setNotes] = useState("");

  // Design visualization state
  const [designData, setDesignData] = useState(null);
  const [showDesignDialog, setShowDesignDialog] = useState(false);
  const [showDesignVisualizer, setShowDesignVisualizer] = useState(false);

  // Fetch customers for dropdown — only show customers with email AND address
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const snap = await getDocs(collection(db, "customers"));
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        // Sort by name
        data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setCustomers(data);
      } catch (error) {
        console.error("Error fetching customers:", error);
      }
    };
    fetchCustomers();
  }, []);

  // Handle customer selection
  const handleCustomerSelect = (event, value) => {
    setSelectedCustomer(value);
  };

  const handleContinueToSave = () => {
    // Gate 1 — must select an existing customer
    if (!selectedCustomer) {
      Swal.fire({
        icon: "warning",
        title: "Select a Customer First",
        html: `You must select an existing customer before creating a bid.<br/><br/>
               If this is a new customer, <strong>add them to the Customers list first</strong> 
               so their address, email, and contact info are on file.`,
        confirmButtonText: "Go to Customers",
        showCancelButton: true,
        cancelButtonText: "Stay Here",
      }).then((result) => {
        if (result.isConfirmed) navigate("/customers");
      });
      return;
    }

    // Gate 2 — customer must have an email address
    if (!selectedCustomer.email) {
      Swal.fire({
        icon: "warning",
        title: "Customer Missing Email",
        html: `<strong>${selectedCustomer.name}</strong> doesn't have an email address on file.<br/><br/>
               An email is required to send the bid for electronic signing.<br/><br/>
               Please update their customer record first.`,
        confirmButtonText: "Edit Customer",
        showCancelButton: true,
        cancelButtonText: "Cancel",
      }).then((result) => {
        if (result.isConfirmed) navigate(`/customer-edit/${selectedCustomer.id}`);
      });
      return;
    }

    // Gate 3 — customer must have an address
    if (!selectedCustomer.address) {
      Swal.fire({
        icon: "warning",
        title: "Customer Missing Address",
        html: `<strong>${selectedCustomer.name}</strong> doesn't have an address on file.<br/><br/>
               An address is required for scheduling and GPS check-in enforcement.<br/><br/>
               Please update their customer record first.`,
        confirmButtonText: "Edit Customer",
        showCancelButton: true,
        cancelButtonText: "Cancel",
      }).then((result) => {
        if (result.isConfirmed) navigate(`/customer-edit/${selectedCustomer.id}`);
      });
      return;
    }

    // Gate 4 — amount is required
    if (!amount) {
      Swal.fire("Missing Info", "Please enter a bid amount.", "warning");
      return;
    }

    // Gate 5 — description is required
    if (!description || !description.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Description Required",
        html: `Please describe the work to be done.<br/><br/>
               <small>This appears on the bid document and helps your crew know what the job is.</small>`,
        confirmButtonText: "OK",
      });
      return;
    }

    setShowDesignDialog(true);
  };

  const handleSkipDesign = () => {
    setShowDesignDialog(false);
    saveBidWithoutDesign();
  };

  const handleAddDesign = () => {
    setShowDesignDialog(false);
    setShowDesignVisualizer(true);
  };

  const handleDesignSaved = (design) => {
    setDesignData(design);
    setShowDesignVisualizer(false);
    saveBidWithDesign(design);
  };

  const handleCancelDesign = () => {
    setShowDesignVisualizer(false);
    setShowDesignDialog(true);
  };

  const saveBidWithoutDesign = async () => {
    try {
      await addDoc(collection(db, "bids"), {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerEmail: selectedCustomer.email || "",
        customerPhone: selectedCustomer.phone || "",
        customerAddress: selectedCustomer.address || "",
        amount: parseFloat(amount),
        description: description || "",
        materials: materials || "",
        notes: notes || "",
        createdAt: new Date().toISOString(),
        hasDesignVisualization: false,
        signingToken: generateSecureToken(),
      });

      await Swal.fire("✅ Bid saved", "Your bid was created.", "success");
      resetForm();
      navigate("/bids");
    } catch (err) {
      console.error("Error adding bid:", err);
      Swal.fire("Error", "Could not save the bid.", "error");
    }
  };

  const saveBidWithDesign = async (design) => {
    try {
      await addDoc(collection(db, "bids"), {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerEmail: selectedCustomer.email || "",
        customerPhone: selectedCustomer.phone || "",
        customerAddress: selectedCustomer.address || "",
        amount: parseFloat(amount),
        description: description || "",
        materials: materials || "",
        notes: notes || "",
        createdAt: new Date().toISOString(),
        hasDesignVisualization: true,
        designVisualization: design,
        signingToken: generateSecureToken(),
      });

      await Swal.fire("✅ Bid saved with design!", "Your bid with visualization was created.", "success");
      resetForm();
      navigate("/bids");
    } catch (err) {
      console.error("Error adding bid:", err);
      Swal.fire("Error", "Could not save the bid.", "error");
    }
  };

  const resetForm = () => {
    setSelectedCustomer(null);
    setAmount("");
    setDescription("");
    setMaterials("");
    setNotes("");
    setDesignData(null);
  };

  if (showDesignVisualizer) {
    return (
      <DesignVisualizer
        customerName={selectedCustomer?.name || ""}
        onSave={handleDesignSaved}
        onCancel={handleCancelDesign}
      />
    );
  }

  return (
    <Container sx={{ mt: { xs: 2, sm: 4 }, pb: { xs: 4, sm: 8 }, px: { xs: 2, sm: 3 } }}>
      <Paper elevation={2} sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2 }}>
        <Typography
          variant="h5"
          gutterBottom
          sx={{ fontSize: { xs: "1.5rem", sm: "2rem" }, mb: 3 }}
        >
          Create New Bid
        </Typography>

        <Box>
          {/* Customer Selection — REQUIRED, no freehand entry */}
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: "bold" }}>
            Customer *
          </Typography>

          <Alert severity="info" sx={{ mb: 2 }}>
            Select an existing customer. If this is a new customer,{" "}
            <strong
              style={{ cursor: "pointer", textDecoration: "underline" }}
              onClick={() => navigate("/customer-edit/new")}
            >
              add them to Customers first
            </strong>
            .
          </Alert>

          <Autocomplete
            options={customers}
            getOptionLabel={(option) => `${option.name}${option.phone ? ` — ${option.phone}` : ""}`}
            value={selectedCustomer}
            onChange={handleCustomerSelect}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search Customers *"
                helperText="Type a name or phone number to search"
                required
              />
            )}
            sx={{ mb: 2 }}
          />

          {/* Show customer info once selected */}
          {selectedCustomer && (
            <Paper
              sx={{
                p: 2,
                mb: 3,
                bgcolor: selectedCustomer.email && selectedCustomer.address ? "#e8f5e9" : "#fff8e1",
                border: "1px solid",
                borderColor: selectedCustomer.email && selectedCustomer.address ? "#a5d6a7" : "#ffe082",
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                {selectedCustomer.name}
              </Typography>
              {selectedCustomer.phone && (
                <Typography variant="body2">📞 {selectedCustomer.phone}</Typography>
              )}
              {selectedCustomer.address && (
                <Typography variant="body2">📍 {selectedCustomer.address}</Typography>
              )}
              {selectedCustomer.email ? (
                <Typography variant="body2">✉️ {selectedCustomer.email}</Typography>
              ) : (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                  <WarningAmberIcon color="warning" fontSize="small" />
                  <Typography variant="body2" color="warning.dark">
                    No email on file — required for signing.{" "}
                    <strong
                      style={{ cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => navigate(`/customer-edit/${selectedCustomer.id}`)}
                    >
                      Edit Customer
                    </strong>
                  </Typography>
                </Box>
              )}
              {!selectedCustomer.address && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                  <WarningAmberIcon color="warning" fontSize="small" />
                  <Typography variant="body2" color="warning.dark">
                    No address on file — required for GPS scheduling.{" "}
                    <strong
                      style={{ cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => navigate(`/customer-edit/${selectedCustomer.id}`)}
                    >
                      Edit Customer
                    </strong>
                  </Typography>
                </Box>
              )}
            </Paper>
          )}

          {/* No customer selected — prompt to add one */}
          {!selectedCustomer && (
            <Box sx={{ mb: 3, textAlign: "center" }}>
              <Button
                variant="outlined"
                startIcon={<PersonAddIcon />}
                onClick={() => navigate("/customer-edit/new")}
              >
                Add New Customer
              </Button>
            </Box>
          )}

          {/* Bid Details */}
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: "bold" }}>
            Bid Details
          </Typography>

          <TextField
            label="Amount ($) *"
            type="number"
            fullWidth
            margin="normal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputProps={{ min: 0, step: "0.01" }}
            required
            sx={{ mb: 2 }}
          />

          <TextField
            label="Description"
            multiline
            rows={4}
            fullWidth
            margin="normal"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the work to be done..."
            sx={{ mb: 2 }}
          />

          <TextField
            label="Materials"
            fullWidth
            margin="normal"
            value={materials}
            onChange={(e) => setMaterials(e.target.value)}
            placeholder="List materials needed..."
            sx={{ mb: 2 }}
          />

          <TextField
            label="Notes"
            multiline
            rows={2}
            fullWidth
            margin="normal"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes..."
            sx={{ mb: 3 }}
          />

          <Button
            variant="contained"
            color="success"
            onClick={handleContinueToSave}
            fullWidth
            size="large"
            sx={{ py: 1.5, fontSize: { xs: "1rem", sm: "1.1rem" } }}
          >
            Continue to Save
          </Button>
        </Box>
      </Paper>

      {/* Design Dialog */}
      <Dialog
        open={showDesignDialog}
        onClose={() => setShowDesignDialog(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ textAlign: "center", pb: 1 }}>
          🎨 Add Design Visualization?
        </DialogTitle>
        <DialogContent>
          <Card sx={{ mb: 2, bgcolor: "#f5f5f5" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                <BrushIcon sx={{ fontSize: 40, color: "primary.main", mr: 2 }} />
                <Typography variant="h6">
                  Show Your Customer What They're Getting!
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                Add a visual design overlay to your bid using our Design Visualizer.
                Upload a photo of the customer's property and sketch out the plan.
              </Typography>
            </CardContent>
          </Card>
        </DialogContent>
        <DialogActions sx={{ flexDirection: isMobile ? "column" : "row", p: 2, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={handleSkipDesign}
            fullWidth={isMobile}
          >
            Skip — Save Bid Without Design
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleAddDesign}
            startIcon={<BrushIcon />}
            fullWidth={isMobile}
          >
            Add Design Visualization
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}