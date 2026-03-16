import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, addDoc, updateDoc, collection } from "firebase/firestore";
import { db } from "./firebase";
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  OutlinedInput,
  CircularProgress,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Swal from "sweetalert2";
import { checkDuplicateCustomer, showDuplicateDialog } from "./utils/checkDuplicateCustomer";

const TAG_OPTIONS = ["VIP", "weekly-mowing", "commercial", "residential", "priority"];

export default function CustomerEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "AZ",
    zip: "",
    notes: "",
    tags: [],
  });

  const isNewCustomer = id === "new";

  useEffect(() => {
    if (!isNewCustomer) {
      loadCustomer();
    }
  }, [id, isNewCustomer]);

  const loadCustomer = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, "customers", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setCustomer({ id: docSnap.id, ...docSnap.data() });
      } else {
        Swal.fire("Not Found", "Customer not found", "error");
        navigate("/customers");
      }
    } catch (error) {
      console.error("Error loading customer:", error);
      Swal.fire("Error", "Failed to load customer", "error");
      navigate("/customers");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCustomer({ ...customer, [name]: value });
  };

  const handleTagsChange = (event) => {
    const { target: { value } } = event;
    setCustomer({
      ...customer,
      tags: typeof value === "string" ? value.split(",") : value,
    });
  };

  const handleSave = async () => {
    // Validation - address is required
    if (!customer.name || !customer.phone || !customer.address) {
      const missing = [];
      if (!customer.name) missing.push("Name");
      if (!customer.phone) missing.push("Phone");
      if (!customer.address) missing.push("Address");
      Swal.fire(
        "Missing Info",
        `The following fields are required: ${missing.join(", ")}`,
        "warning"
      );
      return;
    }

    setSaving(true);

    // Duplicate detection — hard block on email/phone, soft warning on name/address
    // Pass current id as excludeId when editing so we don't flag against self
    const excludeId = isNewCustomer ? null : id;
    const duplicates = await checkDuplicateCustomer(
      db,
      {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
      },
      excludeId
    );

    const action = await showDuplicateDialog(duplicates, navigate);
    if (action === "block" || action === "cancel") {
      setSaving(false);
      return;
    }

    // action === 'proceed' — save the customer
    try {
      // 📍 Geocode the address and store coordinates to enable GPS geofencing
      let geoLat = null;
      let geoLng = null;
      const fullAddress = [customer.address, customer.city, customer.state, customer.zip]
        .filter(Boolean).join(", ");

      try {
        const encoded = encodeURIComponent(fullAddress);
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
          { headers: { "User-Agent": "KCLManager/1.0 (Kings Canyon Landscaping)" } }
        );
        const geoData = await geoRes.json();
        if (geoData.length > 0) {
          geoLat = parseFloat(geoData[0].lat);
          geoLng = parseFloat(geoData[0].lon);
          console.log(`📍 Geocoded: ${fullAddress} → ${geoLat}, ${geoLng}`);
        } else {
          console.warn("📍 Could not geocode address:", fullAddress);
          // Warn admin — address won't work for GPS geofencing
          const { value: continueAnyway } = await Swal.fire({
            icon: "warning",
            title: "Address Not Found",
            html: `The address <strong>${fullAddress}</strong> could not be verified on the map.<br/><br/>
                   Crew members will <strong>not be GPS-blocked</strong> for this customer's jobs until a valid address is saved.<br/><br/>
                   Continue saving anyway?`,
            showCancelButton: true,
            confirmButtonText: "Save Anyway",
            cancelButtonText: "Go Back & Fix Address",
          });
          if (!continueAnyway) {
            setSaving(false);
            return;
          }
        }
      } catch (geoErr) {
        console.warn("📍 Geocoding error:", geoErr);
      }

      const customerData = {
        name: customer.name,
        phone: customer.phone,
        email: customer.email || "",
        address: customer.address || "",
        city: customer.city || "",
        state: customer.state || "AZ",
        zip: customer.zip || "",
        notes: customer.notes || "",
        tags: customer.tags || [],
        updatedAt: new Date().toISOString(),
        nameLower: customer.name.toLowerCase(),
        // 📍 Stored coordinates for GPS geofencing — null if address unverifiable
        geoLat,
        geoLng,
      };

      if (isNewCustomer) {
        customerData.createdAt = new Date().toISOString();
        customerData.lifetimeValue = 0;
        customerData.bidCount = 0;
        customerData.contractCount = 0;
        customerData.invoiceCount = 0;
        customerData.jobCount = 0;

        await addDoc(collection(db, "customers"), customerData);

        await Swal.fire({
          icon: "success",
          title: "Customer Added!",
          text: `${customer.name} has been added to your customers.`,
          timer: 2000,
          showConfirmButton: false,
        });

        navigate("/customers");
      } else {
        await updateDoc(doc(db, "customers", id), customerData);

        await Swal.fire({
          icon: "success",
          title: "Customer Updated!",
          text: `${customer.name}'s information has been updated.`,
          timer: 2000,
          showConfirmButton: false,
        });

        navigate("/customers");
      }
    } catch (error) {
      console.error("Error saving customer:", error);
      Swal.fire("Error", "Failed to save customer", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ textAlign: "center", mt: 4 }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading customer...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 800, mx: "auto" }}>

      {/* Header */}
      <Box sx={{ display: "flex", gap: 2, mb: 3, alignItems: "center" }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/customers")}
          variant="outlined"
        >
          Back
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {isNewCustomer ? "Add New Customer" : "Edit Customer"}
        </Typography>
      </Box>

      {/* Form */}
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>

          {/* Name */}
          <TextField
            label="Customer Name"
            name="name"
            value={customer.name}
            onChange={handleChange}
            required
            fullWidth
            placeholder="e.g., Mrs. Sarah Smith"
          />

          {/* Phone */}
          <TextField
            label="Phone Number"
            name="phone"
            value={customer.phone}
            onChange={handleChange}
            required
            fullWidth
            placeholder="e.g., 928-555-1234"
            type="tel"
            helperText="Must be unique — used for notifications and signing links"
          />

          {/* Email */}
          <TextField
            label="Email Address"
            name="email"
            value={customer.email}
            onChange={handleChange}
            fullWidth
            placeholder="e.g., sarah.smith@email.com"
            type="email"
            helperText="Must be unique — used for signing links and invoice reminders"
          />

          {/* Address */}
          <TextField
            label="Street Address"
            name="address"
            value={customer.address}
            onChange={handleChange}
            required
            fullWidth
            placeholder="e.g., 123 Desert View Dr"
            helperText="Required – needed for scheduling and GPS navigation"
          />

          {/* City, State, Zip */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr 1fr" },
              gap: 2,
            }}
          >
            <TextField
              label="City"
              name="city"
              value={customer.city}
              onChange={handleChange}
              fullWidth
              placeholder="e.g., Bullhead City"
            />
            <TextField
              label="State"
              name="state"
              value={customer.state}
              onChange={handleChange}
              fullWidth
              placeholder="AZ"
            />
            <TextField
              label="ZIP Code"
              name="zip"
              value={customer.zip}
              onChange={handleChange}
              fullWidth
              placeholder="86442"
            />
          </Box>

          {/* Tags */}
          <FormControl fullWidth>
            <InputLabel>Tags</InputLabel>
            <Select
              multiple
              value={customer.tags || []}
              onChange={handleTagsChange}
              input={<OutlinedInput label="Tags" />}
              renderValue={(selected) => (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {selected.map((value) => (
                    <Chip
                      key={value}
                      label={value}
                      color={value === "VIP" ? "warning" : "default"}
                    />
                  ))}
                </Box>
              )}
            >
              {TAG_OPTIONS.map((tag) => (
                <MenuItem key={tag} value={tag}>
                  {tag}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Notes */}
          <TextField
            label="Notes / Special Instructions"
            name="notes"
            value={customer.notes}
            onChange={handleChange}
            fullWidth
            multiline
            rows={4}
            placeholder="e.g., Gate code: 1234, Dog in backyard, Prefers text communication"
            helperText="Add gate codes, preferences, special instructions, etc."
          />

          {/* Action Buttons */}
          <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={saving}
              fullWidth
              size="large"
            >
              {saving ? (
                <CircularProgress size={24} />
              ) : isNewCustomer ? (
                "Add Customer"
              ) : (
                "Save Changes"
              )}
            </Button>
            <Button
              variant="outlined"
              onClick={() => navigate("/customers")}
              disabled={saving}
            >
              Cancel
            </Button>
          </Box>

        </Box>
      </Paper>

      {/* Quick Tips */}
      <Paper sx={{ p: 2, mt: 3, bgcolor: "#f5f5f5" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          💡 Pro Tips:
        </Typography>
        <Typography variant="body2" component="div">
          • Add gate codes and special instructions in Notes
          <br />
          • Use VIP tag for your best customers
          <br />
          • Use weekly-mowing tag for recurring customers
          <br />
          • Full address helps with GPS navigation
          <br />
          • Phone and email must be unique per customer
        </Typography>
      </Paper>

    </Box>
  );
}