import React, { useEffect, useState } from "react";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "./firebase";
import {
  Box,
  Typography,
  Paper,
  Button,
  Card,
  CardContent,
  CardActions,
  CircularProgress,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  InputAdornment,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import VisibilityIcon from "@mui/icons-material/Visibility";
import SortIcon from "@mui/icons-material/Sort";
import DownloadIcon from "@mui/icons-material/Download";
import GpsFixedIcon from "@mui/icons-material/GpsFixed";
import SearchIcon from "@mui/icons-material/Search";
import { markAsViewed } from "./useNotificationCounts";
import { exportCustomersToExcel, exportCustomersToCSV } from "./utils/kclExportUtils";

export default function CustomersDashboard() {
  const [customers, setCustomers] = useState([]);
  const [sortedCustomers, setSortedCustomers] = useState([]);
  const [sortOrder, setSortOrder] = useState("value-high");
  const [gpsFilter, setGpsFilter] = useState("all"); // all | ready | missing
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchCustomers = async () => {
    try {
      const snap = await getDocs(collection(db, "customers"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCustomers(data);
    } catch (error) {
      console.error("Error fetching customers:", error);
      Swal.fire("Error", "Failed to load customers.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    markAsViewed("customers");
  }, []);

  useEffect(() => {
    const sorted = [...customers].sort((a, b) => {
      switch (sortOrder) {
        case "name-asc":
          return (a.name || "").localeCompare(b.name || "");
        case "name-desc":
          return (b.name || "").localeCompare(a.name || "");
        case "value-high":
          return (b.lifetimeValue || 0) - (a.lifetimeValue || 0);
        case "value-low":
          return (a.lifetimeValue || 0) - (b.lifetimeValue || 0);
        case "jobs-most":
          return (b.contractCount || 0) - (a.contractCount || 0);
        case "jobs-least":
          return (a.contractCount || 0) - (b.contractCount || 0);
        case "bids-most":
          return (b.bidCount || 0) - (a.bidCount || 0);
        case "recent":
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        default:
          return 0;
      }
    });

    const gpsFiltered =
      gpsFilter === "ready"
        ? sorted.filter((c) => c.geoLat && c.geoLng)
        : gpsFilter === "missing"
          ? sorted.filter((c) => !c.geoLat || !c.geoLng)
          : sorted;

    const search = searchTerm.trim().toLowerCase();

    const fullyFiltered = !search
      ? gpsFiltered
      : gpsFiltered.filter((customer) => {
          const searchableText = [
            customer.name,
            customer.email,
            customer.phone,
            customer.address,
            customer.city,
            customer.state,
            customer.zip,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchableText.includes(search);
        });

    setSortedCustomers(fullyFiltered);
  }, [customers, sortOrder, gpsFilter, searchTerm]);

  const handleDelete = async (id, name) => {
    const confirm = await Swal.fire({
      title: `Delete ${name}?`,
      text: "This will NOT delete their bids/contracts/invoices, just the customer record.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (!confirm.isConfirmed) return;

    try {
      await deleteDoc(doc(db, "customers", id));
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      Swal.fire("Deleted!", "Customer record removed.", "success");
    } catch (error) {
      Swal.fire("Error", "Failed to delete customer.", "error");
    }
  };

  if (loading) {
    return (
      <Box sx={{ textAlign: "center", mt: 4 }}>
        <CircularProgress />
        <Typography variant="subtitle1" sx={{ mt: 1 }}>
          Loading customers...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Typography variant="h5" sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}>
          Customers ({sortedCustomers.length})
        </Typography>

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder="Search name, phone, email, address..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ minWidth: { xs: "100%", sm: 280 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="sort-label">
              <SortIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: "middle" }} />
              Sort By
            </InputLabel>
            <Select
              labelId="sort-label"
              value={sortOrder}
              label="Sort By"
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <MenuItem value="name-asc">Name (A-Z)</MenuItem>
              <MenuItem value="name-desc">Name (Z-A)</MenuItem>
              <MenuItem value="value-high">Highest Value</MenuItem>
              <MenuItem value="value-low">Lowest Value</MenuItem>
              <MenuItem value="jobs-most">Most Jobs</MenuItem>
              <MenuItem value="jobs-least">Fewest Jobs</MenuItem>
              <MenuItem value="bids-most">Most Bids</MenuItem>
              <MenuItem value="recent">Most Recent</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            size="small"
            startIcon={<GpsFixedIcon />}
            onClick={() => setGpsFilter((f) => (f === "missing" ? "all" : "missing"))}
            color={gpsFilter === "missing" ? "error" : "inherit"}
          >
            {gpsFilter === "missing" ? "Showing: No GPS" : "No GPS Only"}
          </Button>

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => exportCustomersToExcel(sortedCustomers)}
            size="small"
          >
            Excel
          </Button>

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => exportCustomersToCSV(sortedCustomers)}
            size="small"
          >
            CSV
          </Button>

          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={() => navigate("/customer-edit/new")}
            sx={{ display: { xs: "none", sm: "inline-flex" } }}
          >
            Add Customer
          </Button>

          <Button
            variant="contained"
            onClick={() => navigate("/customer-edit/new")}
            sx={{ display: { xs: "inline-flex", sm: "none" } }}
          >
            <PersonAddIcon />
          </Button>
        </Box>
      </Box>

      {sortedCustomers.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="h6" gutterBottom>
            No Customers Found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Try changing your search or filters.
          </Typography>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={() => navigate("/customer-edit/new")}
          >
            Add Customer
          </Button>
        </Paper>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(auto-fill, minmax(300px, 1fr))",
            },
            gap: 2,
          }}
        >
          {sortedCustomers.map((customer) => (
            <Card key={customer.id} sx={{ boxShadow: 2 }}>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 2 }}>
                  <Typography variant="h6" sx={{ fontSize: "1.1rem" }}>
                    {customer.name}
                  </Typography>
                  <Chip
                    label={`$${(customer.lifetimeValue || 0).toLocaleString()}`}
                    color="primary"
                    size="small"
                  />
                </Box>

                {customer.email && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {customer.email}
                  </Typography>
                )}

                {customer.phone && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {customer.phone}
                  </Typography>
                )}

                {customer.address && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {customer.address}
                  </Typography>
                )}

                <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap" }}>
                  <Chip label={`${customer.bidCount || 0} Bids`} size="small" variant="outlined" />
                  <Chip label={`${customer.contractCount || 0} Contracts`} size="small" variant="outlined" />
                  <Chip label={`${customer.invoiceCount || 0} Invoices`} size="small" variant="outlined" />

                  {customer.geoLat && customer.geoLng ? (
                    <Chip
                      icon={<GpsFixedIcon />}
                      label="GPS Ready"
                      size="small"
                      sx={{
                        bgcolor: "#e8f5e9",
                        color: "#2e7d32",
                        fontWeight: 700,
                        "& .MuiChip-icon": { color: "#2e7d32" },
                      }}
                    />
                  ) : (
                    <Chip
                      icon={<GpsFixedIcon />}
                      label="No GPS"
                      size="small"
                      sx={{
                        bgcolor: "#ffebee",
                        color: "#c62828",
                        fontWeight: 700,
                        "& .MuiChip-icon": { color: "#c62828" },
                      }}
                    />
                  )}
                </Box>
              </CardContent>

              <CardActions sx={{ p: 2, pt: 0, flexDirection: "column", gap: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<VisibilityIcon />}
                  onClick={() => navigate(`/customer/${customer.id}`)}
                  fullWidth
                >
                  View Profile
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => handleDelete(customer.id, customer.name)}
                  fullWidth
                  size="small"
                >
                  Delete
                </Button>
              </CardActions>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}