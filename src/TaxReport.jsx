import React, { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import {
  Container,
  Typography,
  Box,
  Paper,
  TextField,
  Grid,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Divider,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ReceiptIcon from "@mui/icons-material/Receipt";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import moment from "moment";

export default function TaxReport() {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedYear, setSelectedYear] = useState("2026"); // Current year by default
  const [dateRange, setDateRange] = useState({
    startDate: "2025-10-01", // Business start date
    endDate: moment().format("YYYY-MM-DD"),
  });

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      // Load expenses
      const expensesSnap = await getDocs(collection(db, "expenses"));
      const expensesData = expensesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Load payments (INCOME)
      const paymentsSnap = await getDocs(collection(db, "payments"));
      const paymentsData = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      setExpenses(expensesData);
      setPayments(paymentsData);
      setLoading(false);
    } catch (error) {
      console.error("Error loading tax data:", error);
      setLoading(false);
    }
  };

  const getFilteredExpenses = () => {
    return expenses.filter((expense) => {
      const expenseDate = moment(expense.date);
      
      // Filter by selected year
      if (selectedYear !== "all") {
        const expenseYear = expenseDate.year();
        if (expenseYear.toString() !== selectedYear) {
          return false;
        }
      }
      
      const inDateRange =
        expenseDate.isSameOrAfter(moment(dateRange.startDate)) &&
        expenseDate.isSameOrBefore(moment(dateRange.endDate));
      return inDateRange && expense.taxDeductible;
    });
  };

  const getFilteredPayments = () => {
    return payments.filter((payment) => {
      const paymentDate = moment(payment.paymentDate);
      
      // Filter by selected year
      if (selectedYear !== "all") {
        const paymentYear = paymentDate.year();
        if (paymentYear.toString() !== selectedYear) {
          return false;
        }
      }
      
      return (
        paymentDate.isSameOrAfter(moment(dateRange.startDate)) &&
        paymentDate.isSameOrBefore(moment(dateRange.endDate))
      );
    });
  };

  const getTotalIncome = () => {
    const filtered = getFilteredPayments();
    return filtered.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  };

  const getTotalExpenses = () => {
    const filtered = getFilteredExpenses();
    return filtered.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  };

  const getNetProfit = () => {
    return getTotalIncome() - getTotalExpenses();
  };

  const getIncomeByMonth = () => {
    const filtered = getFilteredPayments();
    const byMonth = {};
    filtered.forEach((payment) => {
      const month = moment(payment.paymentDate).format("MMM YYYY");
      byMonth[month] = (byMonth[month] || 0) + parseFloat(payment.amount || 0);
    });
    return byMonth;
  };

  const getExpensesByCategory = () => {
    const filtered = getFilteredExpenses();
    const totals = {};
    filtered.forEach((expense) => {
      const category = expense.category || "other";
      totals[category] = (totals[category] || 0) + parseFloat(expense.amount || 0);
    });
    return totals;
  };

  const handleExportCSV = () => {
    const filteredPayments = getFilteredPayments();
    const filteredExpenses = getFilteredExpenses();
    const totalIncome = getTotalIncome();
    const totalExpenses = getTotalExpenses();
    const netProfit = getNetProfit();

    const csvContent = [
      // Header
      ["KINGS CANYON LANDSCAPING LLC - TAX REPORT"],
      [`Period: ${dateRange.startDate} to ${dateRange.endDate}`],
      [""],
      
      // INCOME SECTION
      ["=== GROSS INCOME (REVENUE) ==="],
      ["Date", "Client", "Amount", "Payment Method", "Reference"].join(","),
      ...filteredPayments
        .sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate))
        .map((p) =>
          [
            moment(p.paymentDate).format("MM/DD/YYYY"),
            `"${p.clientName}"`,
            p.amount,
            p.paymentMethod || "—",
            `"${p.reference || ""}"`,
          ].join(",")
        ),
      ["", "", "TOTAL INCOME:", totalIncome.toFixed(2)],
      [""],
      
      // EXPENSES SECTION
      ["=== BUSINESS EXPENSES (DEDUCTIONS) ==="],
      ["Date", "Category", "Vendor", "Amount", "Description", "Job", "Payment Method", "Receipt"].join(","),
      ...filteredExpenses
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map((e) =>
          [
            moment(e.date).format("MM/DD/YYYY"),
            e.category,
            `"${e.vendor}"`,
            e.amount,
            `"${e.description || ""}"`,
            `"${e.jobName || ""}"`,
            e.paymentMethod || "—",
            e.receiptUrl ? "Yes" : "No",
          ].join(",")
        ),
      ["", "", "", "TOTAL EXPENSES:", totalExpenses.toFixed(2)],
      [""],
      
      // SUMMARY
      ["=== TAX SUMMARY ==="],
      ["Gross Income", totalIncome.toFixed(2)],
      ["Business Expenses", `-${totalExpenses.toFixed(2)}`],
      ["Net Profit (Taxable Income)", netProfit.toFixed(2)],
      [""],
      ["Estimated Tax (30% rate)", (netProfit * 0.3).toFixed(2)],
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `KCL_Tax_Report_${dateRange.startDate}_to_${dateRange.endDate}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading tax data...
        </Typography>
      </Container>
    );
  }

  const filteredExpenses = getFilteredExpenses();
  const filteredPayments = getFilteredPayments();
  const totalIncome = getTotalIncome();
  const totalExpenses = getTotalExpenses();
  const netProfit = getNetProfit();
  const categoryTotals = getExpensesByCategory();
  const incomeByMonth = getIncomeByMonth();
  const expensesWithReceipts = filteredExpenses.filter((e) => e.receiptUrl).length;

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 6 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h5">📊 Complete Tax Report</Typography>
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleExportCSV} color="success">
          Export for Tax Preparer
        </Button>
      </Box>

      {/* Date Range Selector */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Tax Year / Date Range
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel id="year-label">Tax Year</InputLabel>
              <Select
                labelId="year-label"
                value={selectedYear}
                label="Tax Year"
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                <MenuItem value="all">All Years</MenuItem>
                <MenuItem value="2024">2024</MenuItem>
                <MenuItem value="2025">2025</MenuItem>
                <MenuItem value="2026">2026</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Start Date"
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="End Date"
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <Button
              variant="outlined"
              fullWidth
              onClick={() =>
                setDateRange({
                  startDate: moment().startOf("year").format("YYYY-MM-DD"),
                  endDate: moment().endOf("year").format("YYYY-MM-DD"),
                })
              }
            >
              Current Tax Year (2025)
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Summary Cards - THE IMPORTANT NUMBERS */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ height: "100%", bgcolor: "success.light" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                <AttachMoneyIcon color="success" />
                <Typography variant="subtitle2" color="success.dark" sx={{ ml: 1 }}>
                  Gross Income
                </Typography>
              </Box>
              <Typography variant="h3" color="success.dark" sx={{ my: 2 }}>
                ${totalIncome.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {filteredPayments.length} payments received
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card sx={{ height: "100%", bgcolor: "error.light" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                <ReceiptIcon color="error" />
                <Typography variant="subtitle2" color="error.dark" sx={{ ml: 1 }}>
                  Total Expenses
                </Typography>
              </Box>
              <Typography variant="h3" color="error.dark" sx={{ my: 2 }}>
                ${totalExpenses.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {filteredExpenses.length} deductible expenses
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card sx={{ height: "100%", bgcolor: netProfit >= 0 ? "primary.light" : "warning.light" }}>
            <CardContent>
              <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
                <TrendingUpIcon color={netProfit >= 0 ? "primary" : "warning"} />
                <Typography variant="subtitle2" color={netProfit >= 0 ? "primary.dark" : "warning.dark"} sx={{ ml: 1 }}>
                  Net Profit
                </Typography>
              </Box>
              <Typography variant="h3" color={netProfit >= 0 ? "primary.dark" : "warning.dark"} sx={{ my: 2 }}>
                ${netProfit.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Taxable income
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card sx={{ height: "100%", bgcolor: "info.light" }}>
            <CardContent>
              <Typography variant="subtitle2" color="info.dark">
                Estimated Tax (30%)
              </Typography>
              <Typography variant="h3" color="info.dark" sx={{ my: 2 }}>
                ${(netProfit * 0.3).toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Set aside for taxes
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs for Income and Expenses */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
          <Tab label={`💰 Income (${filteredPayments.length})`} />
          <Tab label={`🧾 Expenses (${filteredExpenses.length})`} />
          <Tab label="📈 Summary" />
        </Tabs>

        {/* Income Tab */}
        {activeTab === 0 && (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              💰 Gross Income Received
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                    <TableCell>Date</TableCell>
                    <TableCell>Client</TableCell>
                    <TableCell>Payment Method</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell align="right">Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPayments
                    .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))
                    .map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{moment(payment.paymentDate).format("MM/DD/YYYY")}</TableCell>
                        <TableCell>{payment.clientName}</TableCell>
                        <TableCell>{payment.paymentMethod || "—"}</TableCell>
                        <TableCell>{payment.reference || "—"}</TableCell>
                        <TableCell align="right">
                          <Typography fontWeight="bold" color="success.main">
                            ${parseFloat(payment.amount).toFixed(2)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  <TableRow sx={{ backgroundColor: "success.light" }}>
                    <TableCell colSpan={4} align="right">
                      <Typography variant="h6" color="success.dark">TOTAL INCOME:</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="h6" color="success.dark">
                        ${totalIncome.toFixed(2)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Expenses Tab */}
        {activeTab === 1 && (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              🧾 Business Expenses (Tax Deductible)
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
                    <TableCell>Date</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Vendor</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Receipt</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredExpenses
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{moment(expense.date).format("MM/DD/YYYY")}</TableCell>
                        <TableCell sx={{ textTransform: "capitalize" }}>{expense.category}</TableCell>
                        <TableCell>{expense.vendor}</TableCell>
                        <TableCell>{expense.description || "—"}</TableCell>
                        <TableCell align="right">
                          <Typography fontWeight="bold" color="error.main">
                            ${parseFloat(expense.amount).toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {expense.receiptUrl ? (
                            <Button size="small" startIcon={<ReceiptIcon />} onClick={() => window.open(expense.receiptUrl, "_blank")}>
                              View
                            </Button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  <TableRow sx={{ backgroundColor: "error.light" }}>
                    <TableCell colSpan={4} align="right">
                      <Typography variant="h6" color="error.dark">TOTAL EXPENSES:</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="h6" color="error.dark">
                        ${totalExpenses.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Summary Tab */}
        {activeTab === 2 && (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              📈 Tax Summary
            </Typography>
            
            {/* Expense Categories */}
            <Paper sx={{ p: 2, mb: 3, bgcolor: "#f5f5f5" }}>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                Expenses by Category:
              </Typography>
              <Grid container spacing={2}>
                {Object.entries(categoryTotals)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, total]) => (
                    <Grid item xs={12} sm={6} md={4} key={category}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", p: 1 }}>
                        <Typography sx={{ textTransform: "capitalize" }}>{category}:</Typography>
                        <Typography fontWeight="bold">${total.toFixed(2)}</Typography>
                      </Box>
                    </Grid>
                  ))}
              </Grid>
            </Paper>

            {/* Final Calculation */}
            <Paper sx={{ p: 3, bgcolor: "primary.light" }}>
              <Typography variant="h5" gutterBottom align="center" color="primary.dark">
                TAX CALCULATION
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ maxWidth: 500, mx: "auto" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
                  <Typography variant="h6">Gross Income:</Typography>
                  <Typography variant="h6" color="success.main">+${totalIncome.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
                  <Typography variant="h6">Business Expenses:</Typography>
                  <Typography variant="h6" color="error.main">-${totalExpenses.toFixed(2)}</Typography>
                </Box>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
                  <Typography variant="h5" fontWeight="bold">Net Profit (Taxable):</Typography>
                  <Typography variant="h5" fontWeight="bold" color={netProfit >= 0 ? "primary.dark" : "error.main"}>
                    ${netProfit.toFixed(2)}
                  </Typography>
                </Box>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="h6">Estimated Tax (30%):</Typography>
                  <Typography variant="h6" color="info.main">${(netProfit * 0.3).toFixed(2)}</Typography>
                </Box>
              </Box>
            </Paper>
          </Box>
        )}
      </Paper>

      {/* Quick Stats */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          📋 Quick Stats
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="body2" color="text.secondary">Total Payments:</Typography>
            <Typography variant="h6">{filteredPayments.length}</Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="body2" color="text.secondary">Total Expenses:</Typography>
            <Typography variant="h6">{filteredExpenses.length}</Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="body2" color="text.secondary">Receipts Saved:</Typography>
            <Typography variant="h6">{expensesWithReceipts} of {filteredExpenses.length}</Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="body2" color="text.secondary">Profit Margin:</Typography>
            <Typography variant="h6" color={netProfit >= 0 ? "success.main" : "error.main"}>
              {totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : 0}%
            </Typography>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
}