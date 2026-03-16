import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, getDoc, query, where, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useNavigate } from "react-router-dom";
import {
  Container, Typography, Box, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Button, FormControl,
  InputLabel, Select, MenuItem, TextField, Card, CardContent, Grid,
  CircularProgress, useMediaQuery, useTheme, IconButton,
} from "@mui/material";
import moment from "moment";
import PaymentIcon from "@mui/icons-material/Payment";
import FilterListIcon from "@mui/icons-material/FilterList";
import DownloadIcon from "@mui/icons-material/Download";
import SortIcon from "@mui/icons-material/Sort";
import ReceiptIcon from "@mui/icons-material/Receipt";
import DeleteIcon from "@mui/icons-material/Delete";
import { markAsViewed } from './useNotificationCounts';
import generatePaymentReceipt from './pdf/generatePaymentReceipt';
import { viewPaymentReceiptPDF } from './utils/pdfViewerUtils';
import { useAuth } from "./AuthProvider";
import Swal from "sweetalert2";

export default function PaymentsDashboard() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { userRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState([]);
  const [sortedPayments, setSortedPayments] = useState([]);
  const [sortOrder, setSortOrder] = useState("newest");
  const [invoices, setInvoices] = useState([]);

  const [filters, setFilters] = useState({
    startDate: moment().subtract(30, "days").format("YYYY-MM-DD"),
    endDate: moment().format("YYYY-MM-DD"),
    paymentMethod: "all",
    searchClient: "",
    year: "all", // all, 2025, 2026
  });

  useEffect(() => {
    loadData();
  }, []);
  useEffect(() => {
    markAsViewed('payments');
  }, []);

  const loadData = async () => {
    try {
      const paymentsSnap = await getDocs(collection(db, "payments"));
      const paymentsData = paymentsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      const invoicesSnap = await getDocs(collection(db, "invoices"));
      const invoicesData = invoicesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setPayments(paymentsData);
      setInvoices(invoicesData);
      setLoading(false);
    } catch (error) {
      console.error("Error loading payments:", error);
      setLoading(false);
    }
  };

  const getFilteredPayments = () => {
    return payments.filter((payment) => {
      const paymentDate = moment(payment.paymentDate);
      const inDateRange =
        paymentDate.isSameOrAfter(moment(filters.startDate)) &&
        paymentDate.isSameOrBefore(moment(filters.endDate));

      const matchesMethod =
        filters.paymentMethod === "all" ||
        payment.paymentMethod === filters.paymentMethod;

      const matchesClient =
        !filters.searchClient ||
        payment.clientName
          .toLowerCase()
          .includes(filters.searchClient.toLowerCase());

      const matchesYear =
        filters.year === "all" ||
        paymentDate.year() === parseInt(filters.year);

      return inDateRange && matchesMethod && matchesClient && matchesYear;
    });
  };

  const getTotalRevenue = () => {
    const filtered = getFilteredPayments();
    return filtered.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  };

  const getRevenueByMethod = () => {
    const filtered = getFilteredPayments();
    const byMethod = {};

    filtered.forEach((payment) => {
      const method = payment.paymentMethod || "other";
      if (!byMethod[method]) {
        byMethod[method] = 0;
      }
      byMethod[method] += parseFloat(payment.amount || 0);
    });

    return byMethod;
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
      "Credit Card": "Credit Card",
      "Zelle": "Zelle",
      "Check": "Check",
      "Cash": "Cash",
    };
    return methods[method] || method;
  };

  const getPaymentMethodColor = (method) => {
    const colors = {
      cash: "success",
      check: "info",
      zelle: "primary",
      credit_card: "secondary",
      venmo: "info",
      paypal: "primary",
      other: "default",
      "Cash": "success",
      "Zelle": "primary",
      "Check": "info",
      "Credit Card": "secondary",
    };
    return colors[method] || "default";
  };

  const handleExportCSV = () => {
    const filtered = sortedPayments;
    
    const csvContent = [
      ["Date", "Client", "Amount", "Method", "Reference", "Notes"].join(","),
      ...filtered.map((p) =>
        [
          p.paymentDate,
          `"${p.clientName}"`,
          p.amount,
          getPaymentMethodLabel(p.paymentMethod),
          `"${p.reference || ""}"`,
          `"${p.notes || ""}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments_${moment().format("YYYY-MM-DD")}.csv`;
    a.click();
  };

  // Sort filtered payments
  useEffect(() => {
    const filtered = getFilteredPayments();
    const sorted = [...filtered].sort((a, b) => {
      switch (sortOrder) {
        case "newest":
          return new Date(b.paymentDate || 0) - new Date(a.paymentDate || 0);
        case "oldest":
          return new Date(a.paymentDate || 0) - new Date(b.paymentDate || 0);
        case "name-asc":
          return (a.clientName || "").localeCompare(b.clientName || "");
        case "name-desc":
          return (b.clientName || "").localeCompare(a.clientName || "");
        case "amount-high":
          return parseFloat(b.amount || 0) - parseFloat(a.amount || 0);
        case "amount-low":
          return parseFloat(a.amount || 0) - parseFloat(b.amount || 0);
        default:
          return 0;
      }
    });
    setSortedPayments(sorted);
  }, [payments, filters, sortOrder]);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleViewReceipt = async (payment) => {
    try {
      // Fetch the linked invoice if it exists
      let invoice = null;
      if (payment.invoiceId) {
        const invoiceRef = doc(db, 'invoices', payment.invoiceId);
        const invoiceSnap = await getDoc(invoiceRef);
        if (invoiceSnap.exists()) {
          invoice = { id: invoiceSnap.id, ...invoiceSnap.data() };
        } else {
          console.warn(`Invoice ${payment.invoiceId} not found for payment ${payment.id}`);
        }
      }

      // If no invoice is linked, create a minimal invoice object for receipt generation
      if (!invoice) {
        invoice = {
          clientName: payment.clientName,
          total: payment.amount,
          amount: payment.amount, // Include both for compatibility
          description: payment.notes || 'Payment',
        };
      }

      // Calculate total paid and remaining balance for this invoice
      let newTotalPaid;
      let newRemainingBalance;

      if (payment.invoiceId && invoice.id) {
        // Invoice exists - calculate totals across all payments
        const paymentsQuery = query(
          collection(db, 'payments'),
          where('invoiceId', '==', payment.invoiceId)
        );
        const paymentsSnap = await getDocs(paymentsQuery);
        newTotalPaid = paymentsSnap.docs.reduce((sum, doc) => {
          return sum + parseFloat(doc.data().amount || 0);
        }, 0);

        // Use total field, fallback to amount for older records
        const invoiceTotal = parseFloat(invoice.total || invoice.amount || 0);
        newRemainingBalance = invoiceTotal - newTotalPaid;
      } else {
        // No invoice linked - single payment
        newTotalPaid = parseFloat(payment.amount || 0);
        newRemainingBalance = 0;
      }

      // Generate and open the receipt
      await viewPaymentReceiptPDF(
        {
          payment,
          invoice,
          newTotalPaid,
          newRemainingBalance,
        },
        generatePaymentReceipt
      );
    } catch (error) {
      console.error('Error viewing receipt:', error);
      alert('Failed to generate receipt. Please try again.');
    }
  };

  const handleDeletePayment = async (payment) => {
    const result = await Swal.fire({
      title: 'Delete Payment?',
      html: `
        <p>Delete payment for <strong>${payment.clientName}</strong>?</p>
        <p><strong>$${parseFloat(payment.amount).toFixed(2)}</strong> — ${moment(payment.paymentDate).format("MMM D, YYYY")}</p>
        <p style="color:#d32f2f;font-size:0.9em;">⚠️ This cannot be undone.</p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#d33',
      cancelButtonText: 'Cancel',
    });
    if (!result.isConfirmed) return;
    try {
      await deleteDoc(doc(db, 'payments', payment.id));
      setPayments(prev => prev.filter(p => p.id !== payment.id));
      setSortedPayments(prev => prev.filter(p => p.id !== payment.id));
      Swal.fire({ icon: 'success', title: 'Payment Deleted', timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire('Error', 'Failed to delete payment: ' + err.message, 'error');
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading payments...
        </Typography>
      </Container>
    );
  }

  const filteredPayments = sortedPayments;
  const totalRevenue = getTotalRevenue();
  const revenueByMethod = getRevenueByMethod();

  return (
    <Container maxWidth="xl" sx={{ mt: 3, mb: 6 }}>
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
        <Typography variant="h5">Payments Dashboard</Typography>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleExportCSV}
          size="small"
        >
          Export CSV
        </Button>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Total Revenue (Filtered)
              </Typography>
              <Typography variant="h4" color="success.main" sx={{ my: 1 }}>
                ${totalRevenue.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {filteredPayments.length} payments
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Revenue by Payment Method
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 2 }}>
                {Object.entries(revenueByMethod).map(([method, amount]) => (
                  <Box key={method} sx={{ minWidth: 120 }}>
                    <Typography variant="caption" color="text.secondary">
                      {getPaymentMethodLabel(method)}
                    </Typography>
                    <Typography variant="h6" color="primary">
                      ${amount.toFixed(2)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <FilterListIcon sx={{ mr: 1 }} />
          <Typography variant="h6">Filters & Sort</Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Year</InputLabel>
              <Select
                value={filters.year}
                label="Year"
                onChange={(e) => handleFilterChange("year", e.target.value)}
              >
                <MenuItem value="all">All Years</MenuItem>
                <MenuItem value="2025">2025</MenuItem>
                <MenuItem value="2026">2026</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2.5}>
            <TextField
              fullWidth
              label="Start Date"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange("startDate", e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2.5}>
            <TextField
              fullWidth
              label="End Date"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange("endDate", e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel>Payment Method</InputLabel>
              <Select
                value={filters.paymentMethod}
                label="Payment Method"
                onChange={(e) =>
                  handleFilterChange("paymentMethod", e.target.value)
                }
              >
                <MenuItem value="all">All Methods</MenuItem>
                <MenuItem value="Credit Card">Credit Card</MenuItem>
                <MenuItem value="Zelle">Zelle</MenuItem>
                <MenuItem value="Check">Check</MenuItem>
                <MenuItem value="Cash">Cash</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2.5}>
            <TextField
              fullWidth
              label="Search Client"
              value={filters.searchClient}
              onChange={(e) =>
                handleFilterChange("searchClient", e.target.value)
              }
              size="small"
              placeholder="Client name..."
            />
          </Grid>
          <Grid item xs={12}>
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
                <MenuItem value="newest">Newest First</MenuItem>
                <MenuItem value="oldest">Oldest First</MenuItem>
                <MenuItem value="name-asc">Name (A-Z)</MenuItem>
                <MenuItem value="name-desc">Name (Z-A)</MenuItem>
                <MenuItem value="amount-high">Highest Amount</MenuItem>
                <MenuItem value="amount-low">Lowest Amount</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Payments Display */}
      {filteredPayments.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <PaymentIcon sx={{ fontSize: 60, color: "text.secondary", mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No Payments Found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Try adjusting your filters or date range
          </Typography>
        </Paper>
      ) : isMobile ? (
        // Mobile: Card View
        <Box>
          {filteredPayments.map((payment) => (
            <Card key={payment.id} sx={{ mb: 2 }}>
              <CardContent>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "start",
                    mb: 1,
                  }}
                >
                  <Typography variant="h6">{payment.clientName}</Typography>
                  <Typography variant="h6" color="success.main">
                    ${parseFloat(payment.amount).toFixed(2)}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {moment(payment.paymentDate).format("MMM DD, YYYY")}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Chip
                    label={getPaymentMethodLabel(payment.paymentMethod)}
                    color={getPaymentMethodColor(payment.paymentMethod)}
                    size="small"
                  />
                </Box>
                {payment.reference && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Ref: {payment.reference}
                  </Typography>
                )}
                {payment.notes && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 1 }}
                  >
                    {payment.notes}
                  </Typography>
                )}
                <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    onClick={() =>
                      navigate(`/payment-tracker/${payment.invoiceId}`)
                    }
                  >
                    View Invoice
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<ReceiptIcon />}
                    onClick={() => handleViewReceipt(payment)}
                  >
                    View Receipt
                  </Button>
                  {userRole === 'god' && (
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={() => handleDeletePayment(payment)}
                    >
                      Delete
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : (
        // Desktop: Table View
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                <TableCell>Date</TableCell>
                <TableCell>Client</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography color="text.secondary" sx={{ py: 3 }}>
                      No payments found for selected filters
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {moment(payment.paymentDate).format("MMM DD, YYYY")}
                    </TableCell>
                    <TableCell>{payment.clientName}</TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body1"
                        fontWeight="bold"
                        color="success.main"
                      >
                        ${parseFloat(payment.amount).toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getPaymentMethodLabel(payment.paymentMethod)}
                        color={getPaymentMethodColor(payment.paymentMethod)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{payment.reference || "—"}</TableCell>
                    <TableCell>{payment.notes || "—"}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          onClick={() =>
                            navigate(`/payment-tracker/${payment.invoiceId}`)
                          }
                        >
                          View Invoice
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<ReceiptIcon />}
                          onClick={() => handleViewReceipt(payment)}
                        >
                          Receipt
                        </Button>
                        {userRole === 'god' && (
                          <IconButton
                            size="small"
                            color="error"
                            title="Delete Payment"
                            onClick={() => handleDeletePayment(payment)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
}