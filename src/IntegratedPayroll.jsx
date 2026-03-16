import React, { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, query, where, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthProvider";
import {
  Container, Typography, Button, Box, Card, CardContent, Grid, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert,
  Paper, Table, TableBody, TableCell, TableHead, TableRow, Tabs, Tab,
  Divider, IconButton, Collapse, MenuItem, InputAdornment,
} from "@mui/material";
import Swal from "sweetalert2";
import PaymentIcon from "@mui/icons-material/Payment";
import HistoryIcon from "@mui/icons-material/History";
import ReceiptIcon from "@mui/icons-material/Receipt";
import WorkIcon from "@mui/icons-material/Work";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import DeleteIcon from "@mui/icons-material/Delete";
import moment from "moment";

// ── helpers ──────────────────────────────────────────────────────────────────
function calcPerPeriod(annualSalary, paySchedule) {
  const s = parseFloat(annualSalary) || 0;
  return paySchedule === 'biweekly' ? (s / 26) : (s / 24);
}

function nextPayDate(paySchedule) {
  const today = moment();
  if (paySchedule === 'biweekly') {
    // Next even Friday from an arbitrary anchor
    const anchor = moment('2024-01-05'); // Known bi-weekly Friday
    const days = today.diff(anchor, 'days');
    const daysToNext = 14 - (days % 14);
    return today.clone().add(daysToNext === 14 ? 0 : daysToNext, 'days').format('MMM D, YYYY');
  }
  // Semi-monthly: 15th and last day of month
  const day = today.date();
  if (day < 15) return today.clone().date(15).format('MMM D, YYYY');
  return today.clone().endOf('month').format('MMM D, YYYY');
}

export default function IntegratedPayroll() {
  const { userRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  const [crews, setCrews] = useState([]);
  const [approvedHours, setApprovedHours] = useState([]);
  const [allTimeEntries, setAllTimeEntries] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);

  const [expandedEmployee, setExpandedEmployee] = useState(null);
  const [expandedPayment, setExpandedPayment] = useState(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [salaryDialogOpen, setSalaryDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedTimeEntries, setSelectedTimeEntries] = useState([]);
  const [salaryEmployee, setSalaryEmployee] = useState(null);

  const [paymentForm, setPaymentForm] = useState({
    paymentDate: moment().format("YYYY-MM-DD"),
    paymentMethod: "Cash",
    notes: "",
    paymentType: "hourly",
    flatRateAmount: "",
  });

  const [salaryForm, setSalaryForm] = useState({
    paymentDate: moment().format("YYYY-MM-DD"),
    paymentMethod: "Direct Deposit",
    notes: "",
    bonusAmount: "0",
    payPeriodStart: "",
    payPeriodEnd: "",
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const usersSnap = await getDocs(collection(db, "users"));
      const crewsData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCrews(crewsData);

      const timeQuery = query(collection(db, "job_time_entries"), where("status", "==", "approved"));
      const timeSnap = await getDocs(timeQuery);
      const timeData = timeSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Also load paid entries so payment history can show job names
      const paidQuery = query(collection(db, "job_time_entries"), where("status", "==", "paid"));
      const paidSnap = await getDocs(paidQuery);
      const paidData = paidSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const allTimeData = [...timeData, ...paidData];
      allTimeData.sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
      setApprovedHours(timeData); // approved only for payment tab
      setAllTimeEntries(allTimeData); // all entries for history job lookup

      const paymentsSnap = await getDocs(collection(db, "crew_payments"));
      const paymentsData = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      paymentsData.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));
      setPaymentHistory(paymentsData);
    } catch (error) {
      console.error("Error loading payroll data:", error);
      Swal.fire("Error", "Failed to load payroll data", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Hourly employees with pending approved hours ──────────────────────────
  const getEmployeeHours = () => {
    const grouped = {};
    approvedHours.forEach(entry => {
      const name = entry.crewName;
      if (!grouped[name]) {
        const crew = crews.find(c => c.name === name || c.id === entry.crewId);
        grouped[name] = {
          crewName: name,
          crewId: crew?.id || entry.crewId || null,
          hourlyRate: parseFloat(crew?.hourlyRate || 15),
          paymentType: crew?.paymentType || "hourly",
          is1099: crew?.is1099 !== false,
          entries: [],
          totalHours: 0,
          totalPay: 0,
        };
      }
      const hours = parseFloat(entry.hoursWorked || 0);
      grouped[name].entries.push(entry);
      grouped[name].totalHours += hours;
      grouped[name].totalPay += hours * grouped[name].hourlyRate;
    });
    return Object.values(grouped).sort((a, b) => b.totalHours - a.totalHours);
  };

  // ── Salary employees ──────────────────────────────────────────────────────
  const getSalaryEmployees = () =>
    crews
      .filter(c => c.employmentType === 'salary' && c.active !== false && c.annualSalary > 0)
      .map(c => {
        const perPeriod = calcPerPeriod(c.annualSalary, c.paySchedule);
        const lastPayment = paymentHistory
          .filter(p => p.crewId === c.id && p.employmentType === 'salary')
          .sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate))[0];
        return {
          ...c,
          perPeriod,
          lastPaidDate: lastPayment ? moment(lastPayment.paymentDate).format('MMM D, YYYY') : 'Never',
          nextPayDate: nextPayDate(c.paySchedule || 'semi-monthly'),
        };
      });

  const employeeHours = getEmployeeHours();
  const salaryEmployees = getSalaryEmployees();

  // ── Hourly payment ────────────────────────────────────────────────────────
  const handleOpenPaymentDialog = (employee) => {
    setSelectedEmployee(employee);
    setSelectedTimeEntries(employee.entries);
    setPaymentForm({
      paymentDate: moment().format("YYYY-MM-DD"),
      paymentMethod: "Cash",
      notes: `Pay period — ${employee.entries.length} time entries`,
      paymentType: employee.paymentType || "hourly",
      flatRateAmount: "",
    });
    setPaymentDialogOpen(true);
  };

  const handlePayEmployee = async () => {
    try {
      const totalHours = selectedEmployee.totalHours;
      const hourlyRate = selectedEmployee.hourlyRate;
      let totalPay;
      if (paymentForm.paymentType === "flat") {
        const flat = parseFloat(paymentForm.flatRateAmount);
        if (!flat || flat <= 0) { Swal.fire("Error", "Enter a valid flat rate amount", "error"); return; }
        totalPay = flat;
      } else {
        totalPay = selectedEmployee.totalPay;
      }

      const dates = selectedTimeEntries.map(e => new Date(e.clockIn));
      const startDate = moment(Math.min(...dates)).format("YYYY-MM-DD");
      const endDate   = moment(Math.max(...dates)).format("YYYY-MM-DD");

      const paymentData = {
        crewId: selectedEmployee.crewId || null,
        crewName: selectedEmployee.crewName,
        employmentType: 'hourly',
        amount: totalPay,
        hoursWorked: totalHours,
        hourlyRate,
        paymentType: paymentForm.paymentType,
        flatRateAmount: paymentForm.paymentType === "flat" ? totalPay : null,
        payPeriodStart: startDate,
        payPeriodEnd: endDate,
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod,
        notes: paymentForm.notes,
        timeEntryIds: selectedTimeEntries.map(e => e.id),
        is1099: selectedEmployee.is1099 !== false,
        taxYear: moment(paymentForm.paymentDate).year(),
        createdAt: new Date().toISOString(),
      };

      // Remove any undefined values — Firestore rejects them
      Object.keys(paymentData).forEach(k => paymentData[k] === undefined && delete paymentData[k]);

      const paymentRef = await addDoc(collection(db, "crew_payments"), paymentData);
      for (const entry of selectedTimeEntries) {
        await updateDoc(doc(db, "job_time_entries", entry.id), {
          status: "paid", paidAt: new Date().toISOString(), paymentId: paymentRef.id,
        });
      }

      const detail = paymentForm.paymentType === "flat"
        ? `Flat Rate: <strong>$${totalPay.toFixed(2)}</strong>`
        : `${totalHours.toFixed(1)}h × $${hourlyRate}/hr = <strong>$${totalPay.toFixed(2)}</strong>`;

      Swal.fire({ icon: "success", title: "Payment Created!", html: `<p><strong>${selectedEmployee.crewName}</strong></p><p>${detail}</p>`, timer: 3000 });
      setPaymentDialogOpen(false);
      loadData();
    } catch (error) {
      Swal.fire("Error", "Failed to create payment: " + error.message, "error");
    }
  };

  // ── Salary payment ────────────────────────────────────────────────────────
  const handleOpenSalaryDialog = (emp) => {
    setSalaryEmployee(emp);
    const perPeriod = calcPerPeriod(emp.annualSalary, emp.paySchedule);
    // Auto-fill pay period dates based on schedule
    const today = moment();
    let start, end;
    if (emp.paySchedule === 'biweekly') {
      start = today.clone().startOf('week').format('YYYY-MM-DD');
      end   = today.clone().startOf('week').add(13, 'days').format('YYYY-MM-DD');
    } else {
      const day = today.date();
      if (day >= 15) {
        start = today.clone().date(15).format('YYYY-MM-DD');
        end   = today.clone().endOf('month').format('YYYY-MM-DD');
      } else {
        start = today.clone().startOf('month').format('YYYY-MM-DD');
        end   = today.clone().date(14).format('YYYY-MM-DD');
      }
    }
    setSalaryForm({
      paymentDate: moment().format("YYYY-MM-DD"),
      paymentMethod: "Direct Deposit",
      notes: `Salary — ${emp.paySchedule === 'biweekly' ? 'bi-weekly' : 'semi-monthly'} pay`,
      bonusAmount: "0",
      payPeriodStart: start,
      payPeriodEnd: end,
    });
    setSalaryDialogOpen(true);
  };

  const handlePaySalaryEmployee = async () => {
    try {
      const basePay  = calcPerPeriod(salaryEmployee.annualSalary, salaryEmployee.paySchedule);
      const bonus    = parseFloat(salaryForm.bonusAmount) || 0;
      const totalPay = basePay + bonus;

      const paymentData = {
        crewId: salaryEmployee.id,
        crewName: salaryEmployee.name,
        employmentType: 'salary',
        amount: parseFloat(totalPay.toFixed(2)),
        basePay: parseFloat(basePay.toFixed(2)),
        bonusAmount: bonus,
        annualSalary: salaryEmployee.annualSalary,
        paySchedule: salaryEmployee.paySchedule,
        hoursWorked: null,
        hourlyRate: null,
        paymentType: 'salary',
        payPeriodStart: salaryForm.payPeriodStart,
        payPeriodEnd: salaryForm.payPeriodEnd,
        paymentDate: salaryForm.paymentDate,
        paymentMethod: salaryForm.paymentMethod,
        notes: salaryForm.notes,
        is1099: false,
        taxYear: moment(salaryForm.paymentDate).year(),
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "crew_payments"), paymentData);

      Swal.fire({
        icon: "success",
        title: "Salary Payment Recorded!",
        html: `
          <p><strong>${salaryEmployee.name}</strong></p>
          <p>Base pay: <strong>$${basePay.toFixed(2)}</strong></p>
          ${bonus > 0 ? `<p>Bonus: <strong>$${bonus.toFixed(2)}</strong></p>` : ''}
          <p>Total: <strong>$${totalPay.toFixed(2)}</strong></p>
          <p style="color:#666">Period: ${salaryForm.payPeriodStart} → ${salaryForm.payPeriodEnd}</p>
        `,
        timer: 4000,
      });
      setSalaryDialogOpen(false);
      loadData();
    } catch (error) {
      Swal.fire("Error", "Failed to record salary payment: " + error.message, "error");
    }
  };

  // ── Delete payment (god only) ─────────────────────────────────────────────
  const handleDeletePayment = async (payment) => {
    const result = await Swal.fire({
      title: 'Delete Payment Record?',
      html: `
        <p>Delete this payment for <strong>${payment.crewName}</strong>?</p>
        <p><strong>$${parseFloat(payment.amount).toFixed(2)}</strong> — ${payment.paymentDate}</p>
        <p style="color:#d32f2f;font-size:0.9em;">⚠️ This cannot be undone. Time entries will remain but be unmarked as paid.</p>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#d33',
      cancelButtonText: 'Cancel',
    });
    if (!result.isConfirmed) return;
    try {
      // If hourly payment, unmark the time entries
      if (payment.timeEntryIds?.length > 0) {
        for (const entryId of payment.timeEntryIds) {
          await updateDoc(doc(db, 'job_time_entries', entryId), {
            status: 'approved',
            paidAt: null,
            paymentId: null,
          });
        }
      }
      await deleteDoc(doc(db, 'crew_payments', payment.id));
      Swal.fire({ icon: 'success', title: 'Payment Deleted', timer: 1500, showConfirmButton: false });
      loadData();
    } catch (err) {
      Swal.fire('Error', 'Failed to delete: ' + err.message, 'error');
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalUnpaidHours  = approvedHours.reduce((s, e) => s + parseFloat(e.hoursWorked || 0), 0);
  const totalUnpaidAmount = employeeHours.reduce((s, e) => s + e.totalPay, 0);
  const totalPaymentsYTD  = paymentHistory
    .filter(p => moment(p.paymentDate).year() === moment().year())
    .reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  // ── Salary due this period ─────────────────────────────────────────────────
  const salaryDueThisPeriod = salaryEmployees.reduce((s, e) => s + e.perPeriod, 0);

  if (loading) {
    return <Container sx={{ mt: 4, textAlign: "center" }}><Typography>Loading payroll...</Typography></Container>;
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4" fontWeight="bold">💼 Integrated Payroll</Typography>
        <Button variant="outlined" startIcon={<ReceiptIcon />} onClick={() => setActiveTab(3)}>
          Tax Reports
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: "warning.light" }}>
            <CardContent>
              <Typography variant="h6">Unpaid Hours</Typography>
              <Typography variant="h4" fontWeight="bold">{totalUnpaidHours.toFixed(1)}h</Typography>
              <Typography variant="body2" color="text.secondary">{approvedHours.length} approved entries</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: "error.light" }}>
            <CardContent>
              <Typography variant="h6">Hourly Owed</Typography>
              <Typography variant="h4" fontWeight="bold">${totalUnpaidAmount.toFixed(2)}</Typography>
              <Typography variant="body2" color="text.secondary">{employeeHours.length} employees</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: "info.light" }}>
            <CardContent>
              <Typography variant="h6">Salary This Period</Typography>
              <Typography variant="h4" fontWeight="bold">${salaryDueThisPeriod.toFixed(2)}</Typography>
              <Typography variant="body2" color="text.secondary">{salaryEmployees.length} salaried employees</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: "success.light" }}>
            <CardContent>
              <Typography variant="h6">Paid YTD ({moment().year()})</Typography>
              <Typography variant="h4" fontWeight="bold">${totalPaymentsYTD.toFixed(2)}</Typography>
              <Typography variant="body2" color="text.secondary">
                {paymentHistory.filter(p => moment(p.paymentDate).year() === moment().year()).length} payments
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
          <Tab label={`Hourly — Approved Hours (${employeeHours.length})`} />
          <Tab label={`Salary (${salaryEmployees.length})`} />
          <Tab label="Payment History" />
          <Tab label="Tax Reports" />
        </Tabs>
      </Paper>

      {/* ── TAB 0: HOURLY APPROVED HOURS ───────────────────────────────────── */}
      {activeTab === 0 && (
        <Box>
          {employeeHours.length === 0 && (
            <Alert severity="info">No approved hours awaiting payment. All caught up! 🎉</Alert>
          )}
          {employeeHours.map(employee => (
            <Card key={employee.crewName} sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Typography variant="h6" fontWeight="bold">{employee.crewName}</Typography>
                    {employee.is1099 && <Chip label="1099" size="small" color="primary" />}
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box sx={{ textAlign: "right" }}>
                      <Typography variant="h6" fontWeight="bold">
                        {employee.totalHours.toFixed(1)}h × ${employee.hourlyRate}/hr
                      </Typography>
                      <Typography variant="h5" color="success.main" fontWeight="bold">
                        ${employee.totalPay.toFixed(2)}
                      </Typography>
                    </Box>
                    <IconButton onClick={() => setExpandedEmployee(expandedEmployee === employee.crewName ? null : employee.crewName)}>
                      {expandedEmployee === employee.crewName ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </Box>
                </Box>

                <Collapse in={expandedEmployee === employee.crewName}>
                  <Divider sx={{ mb: 2 }} />
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Date</strong></TableCell>
                        <TableCell><strong>Clock In</strong></TableCell>
                        <TableCell><strong>Clock Out</strong></TableCell>
                        <TableCell><strong>Hours</strong></TableCell>
                        <TableCell><strong>Job</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {employee.entries.map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell>{moment(entry.clockIn).format("MMM D, YYYY")}</TableCell>
                          <TableCell>{moment(entry.clockIn).format("h:mm A")}</TableCell>
                          <TableCell>{moment(entry.clockOut).format("h:mm A")}</TableCell>
                          <TableCell><strong>{entry.hoursWorked}h</strong></TableCell>
                          <TableCell>{entry.jobDescription || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Collapse>

                <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
                  <Button variant="contained" color="success" size="large" startIcon={<PaymentIcon />}
                    onClick={() => handleOpenPaymentDialog(employee)}>
                    Pay {employee.crewName} — ${employee.totalPay.toFixed(2)}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* ── TAB 1: SALARY EMPLOYEES ──────────────────────────────────────────── */}
      {activeTab === 1 && (
        <Box>
          {salaryEmployees.length === 0 && (
            <Alert severity="info">
              No salaried employees found. Set an employee's Employment Type to "Salary" in the Employees section.
            </Alert>
          )}
          {salaryEmployees.map(emp => (
            <Card key={emp.id} sx={{ mb: 2 }}>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <WorkIcon color="info" />
                    <Box>
                      <Typography variant="h6" fontWeight="bold">{emp.name}</Typography>
                      <Typography variant="body2" color="text.secondary">{emp.jobTitle || 'Salaried Employee'}</Typography>
                    </Box>
                  </Box>

                  <Box sx={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
                    <Box sx={{ textAlign: "center" }}>
                      <Typography variant="caption" color="text.secondary">Annual Salary</Typography>
                      <Typography variant="h6" fontWeight="bold">${(emp.annualSalary || 0).toLocaleString()}</Typography>
                    </Box>
                    <Box sx={{ textAlign: "center" }}>
                      <Typography variant="caption" color="text.secondary">Per Period ({emp.paySchedule === 'biweekly' ? 'Bi-Weekly' : 'Semi-Monthly'})</Typography>
                      <Typography variant="h5" color="success.main" fontWeight="bold">
                        ${emp.perPeriod.toFixed(2)}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: "center" }}>
                      <Typography variant="caption" color="text.secondary">Last Paid</Typography>
                      <Typography variant="body2">{emp.lastPaidDate}</Typography>
                    </Box>
                    <Box sx={{ textAlign: "center" }}>
                      <Typography variant="caption" color="text.secondary">Next Pay Date</Typography>
                      <Typography variant="body2" color="primary">{emp.nextPayDate}</Typography>
                    </Box>
                    <Button variant="contained" color="info" startIcon={<PaymentIcon />}
                      onClick={() => handleOpenSalaryDialog(emp)}>
                      Process Payment
                    </Button>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
          {salaryEmployees.length > 0 && (
            <Paper sx={{ p: 2, mt: 2, bgcolor: "info.50" }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Note:</strong> Amounts shown are gross pay. This app tracks gross pay amounts for record keeping.
                Use your CPA or payroll service for tax withholding calculations (federal/state income tax, FICA, etc.).
              </Typography>
            </Paper>
          )}
        </Box>
      )}

      {/* ── TAB 2: PAYMENT HISTORY ───────────────────────────────────────────── */}
      {activeTab === 2 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom fontWeight="bold">
            Payment History
            <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
              Click a row to see individual time entries
            </Typography>
          </Typography>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width={40} />
                <TableCell><strong>Date</strong></TableCell>
                <TableCell><strong>Employee</strong></TableCell>
                <TableCell><strong>Type</strong></TableCell>
                <TableCell><strong>Hours</strong></TableCell>
                <TableCell><strong>Jobs Worked</strong></TableCell>
                <TableCell><strong>Amount</strong></TableCell>
                <TableCell><strong>Method</strong></TableCell>
                {userRole === 'god' && <TableCell><strong>Delete</strong></TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {paymentHistory.map(payment => {
                const jobNames = payment.timeEntryIds
                  ? [...new Set(
                      payment.timeEntryIds
                        .map(id => {
                          const entry = allTimeEntries.find(e => e.id === id);
                          return entry?.jobDescription || entry?.jobName || null;
                        })
                        .filter(Boolean)
                    )]
                  : [];

                const detailEntries = payment.timeEntryIds
                  ? payment.timeEntryIds
                      .map(id => allTimeEntries.find(e => e.id === id))
                      .filter(Boolean)
                      .sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn))
                  : [];

                const isExpanded = expandedPayment === payment.id;

                return (
                  <React.Fragment key={payment.id}>
                    <TableRow
                      hover
                      sx={{ cursor: detailEntries.length > 0 ? 'pointer' : 'default',
                            bgcolor: isExpanded ? 'action.selected' : 'inherit' }}
                      onClick={() => detailEntries.length > 0 && setExpandedPayment(isExpanded ? null : payment.id)}
                    >
                      <TableCell>
                        {detailEntries.length > 0 && (
                          <IconButton size="small">
                            {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell>{moment(payment.paymentDate).format("MMM D, YYYY")}</TableCell>
                      <TableCell>
                        {payment.crewName}
                        {payment.is1099 && <Chip label="1099" size="small" color="primary" sx={{ ml: 1 }} />}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={payment.employmentType === 'salary' ? 'Salary' : 'Hourly'}
                          size="small"
                          color={payment.employmentType === 'salary' ? 'info' : 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {payment.employmentType === 'salary'
                          ? `${payment.payPeriodStart} → ${payment.payPeriodEnd}`
                          : `${parseFloat(payment.hoursWorked || 0).toFixed(1)}h`
                        }
                      </TableCell>
                      <TableCell sx={{ maxWidth: 200 }}>
                        {payment.employmentType === 'salary'
                          ? <Typography variant="caption" color="text.secondary">Salaried</Typography>
                          : jobNames.length > 0
                            ? jobNames.map((job, i) => (
                                <Chip key={i} label={job} size="small" variant="outlined"
                                  sx={{ mr: 0.5, mb: 0.5, fontSize: '0.7rem' }} />
                              ))
                            : <Typography variant="caption" color="text.secondary">
                                {payment.payPeriodStart
                                  ? `${moment(payment.payPeriodStart).format("MMM D")} – ${moment(payment.payPeriodEnd).format("MMM D")}`
                                  : '—'}
                              </Typography>
                        }
                      </TableCell>
                      <TableCell><strong>${parseFloat(payment.amount || 0).toFixed(2)}</strong></TableCell>
                      <TableCell>{payment.paymentMethod}</TableCell>
                      {userRole === 'god' && (
                        <TableCell onClick={e => e.stopPropagation()}>
                          <IconButton size="small" color="error" title="Delete Payment"
                            onClick={() => handleDeletePayment(payment)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      )}
                    </TableRow>

                    {/* Expandable detail rows */}
                    {isExpanded && detailEntries.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={userRole === 'god' ? 9 : 8} sx={{ p: 0, bgcolor: '#f5f5f5' }}>
                          <Box sx={{ p: 2 }}>
                            <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                              Time Entries Included — {payment.crewName} — Paid {moment(payment.paymentDate).format("MMM D, YYYY")}
                            </Typography>
                            <Table size="small">
                              <TableHead>
                                <TableRow sx={{ bgcolor: '#eeeeee' }}>
                                  <TableCell><strong>Date</strong></TableCell>
                                  <TableCell><strong>Job</strong></TableCell>
                                  <TableCell><strong>Clock In</strong></TableCell>
                                  <TableCell><strong>Clock Out</strong></TableCell>
                                  <TableCell align="right"><strong>Hours</strong></TableCell>
                                  <TableCell><strong>Status</strong></TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {detailEntries.map(entry => (
                                  <TableRow key={entry.id}>
                                    <TableCell>{moment(entry.clockIn).format("MMM D, YYYY")}</TableCell>
                                    <TableCell>{entry.jobDescription || entry.jobName || '—'}</TableCell>
                                    <TableCell>{moment(entry.clockIn).format("h:mm A")}</TableCell>
                                    <TableCell>{entry.clockOut ? moment(entry.clockOut).format("h:mm A") : '—'}</TableCell>
                                    <TableCell align="right">
                                      <strong>{parseFloat(entry.hoursWorked || 0).toFixed(1)}h</strong>
                                      {entry.lunchMinutes > 0 && (
                                        <Typography variant="caption" color="text.secondary" display="block">
                                          -{entry.lunchMinutes}m lunch
                                        </Typography>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <Chip label={entry.status} size="small"
                                        color={entry.status === 'paid' ? 'success' : entry.status === 'approved' ? 'info' : 'warning'} />
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow sx={{ bgcolor: '#eeeeee' }}>
                                  <TableCell colSpan={4}><strong>TOTAL</strong></TableCell>
                                  <TableCell align="right">
                                    <strong>
                                      {detailEntries.reduce((s, e) => s + parseFloat(e.hoursWorked || 0), 0).toFixed(1)}h
                                    </strong>
                                  </TableCell>
                                  <TableCell />
                                </TableRow>
                              </TableBody>
                            </Table>
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* ── TAB 3: TAX REPORTS ───────────────────────────────────────────────── */}
      {activeTab === 3 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom fontWeight="bold">
            Tax Reports — {moment().year()}
          </Typography>
          <Alert severity="info" sx={{ mb: 3 }}>
            1099 contractors only. W-2 employees are excluded from 1099 reporting.
          </Alert>
          {(() => {
            const ytdPayments = paymentHistory.filter(p =>
              moment(p.paymentDate).year() === moment().year() && p.is1099
            );
            const byContractor = {};
            ytdPayments.forEach(p => {
              if (!byContractor[p.crewName]) byContractor[p.crewName] = { name: p.crewName, total: 0, payments: 0 };
              byContractor[p.crewName].total += parseFloat(p.amount || 0);
              byContractor[p.crewName].payments++;
            });
            const contractors = Object.values(byContractor).sort((a, b) => b.total - a.total);
            if (contractors.length === 0) return <Alert severity="success">No 1099 contractor payments this year.</Alert>;
            return (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Contractor</strong></TableCell>
                    <TableCell><strong>Payments</strong></TableCell>
                    <TableCell><strong>YTD Total</strong></TableCell>
                    <TableCell><strong>1099 Required</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {contractors.map(c => (
                    <TableRow key={c.name}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.payments}</TableCell>
                      <TableCell><strong>${c.total.toFixed(2)}</strong></TableCell>
                      <TableCell>
                        <Chip
                          label={c.total >= 600 ? "Yes — File 1099" : "No ($600 threshold)"}
                          color={c.total >= 600 ? "error" : "default"}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          })()}
        </Paper>
      )}

      {/* ── HOURLY PAYMENT DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={paymentDialogOpen} onClose={() => setPaymentDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Pay {selectedEmployee?.crewName}</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 3 }}>
          <TextField select label="Payment Type" value={paymentForm.paymentType}
            onChange={e => setPaymentForm({ ...paymentForm, paymentType: e.target.value })} fullWidth>
            <MenuItem value="hourly">Hourly ({selectedEmployee?.totalHours.toFixed(1)}h × ${selectedEmployee?.hourlyRate}/hr = ${selectedEmployee?.totalPay.toFixed(2)})</MenuItem>
            <MenuItem value="flat">Flat Rate (override hours calculation)</MenuItem>
          </TextField>
          {paymentForm.paymentType === "flat" && (
            <TextField label="Flat Rate Amount" type="number" value={paymentForm.flatRateAmount}
              onChange={e => setPaymentForm({ ...paymentForm, flatRateAmount: e.target.value })} fullWidth
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} />
          )}
          <TextField label="Payment Date" type="date" value={paymentForm.paymentDate}
            onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
            InputLabelProps={{ shrink: true }} fullWidth />
          <TextField select label="Payment Method" value={paymentForm.paymentMethod}
            onChange={e => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })} fullWidth>
            {["Cash", "Check", "Zelle", "Venmo", "Direct Deposit"].map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </TextField>
          <TextField label="Notes" value={paymentForm.notes}
            onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} fullWidth multiline rows={2} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPaymentDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handlePayEmployee} startIcon={<PaymentIcon />}>
            Record Payment — ${paymentForm.paymentType === "flat" ? (parseFloat(paymentForm.flatRateAmount) || 0).toFixed(2) : selectedEmployee?.totalPay.toFixed(2)}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── SALARY PAYMENT DIALOG ─────────────────────────────────────────────── */}
      <Dialog open={salaryDialogOpen} onClose={() => setSalaryDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ bgcolor: "info.main", color: "white" }}>
          Salary Payment — {salaryEmployee?.name}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {salaryEmployee && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <strong>Base Pay This Period: ${calcPerPeriod(salaryEmployee.annualSalary, salaryEmployee.paySchedule).toFixed(2)}</strong>
              <br />
              ${(salaryEmployee.annualSalary || 0).toLocaleString()}/yr ÷ {salaryEmployee.paySchedule === 'biweekly' ? '26' : '24'} periods
              ({salaryEmployee.paySchedule === 'biweekly' ? 'bi-weekly' : 'semi-monthly'})
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField label="Pay Period Start" type="date" value={salaryForm.payPeriodStart}
                onChange={e => setSalaryForm({ ...salaryForm, payPeriodStart: e.target.value })}
                InputLabelProps={{ shrink: true }} fullWidth />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Pay Period End" type="date" value={salaryForm.payPeriodEnd}
                onChange={e => setSalaryForm({ ...salaryForm, payPeriodEnd: e.target.value })}
                InputLabelProps={{ shrink: true }} fullWidth />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Payment Date" type="date" value={salaryForm.paymentDate}
                onChange={e => setSalaryForm({ ...salaryForm, paymentDate: e.target.value })}
                InputLabelProps={{ shrink: true }} fullWidth />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Bonus / Additional Amount (optional)" type="number" value={salaryForm.bonusAmount}
                onChange={e => setSalaryForm({ ...salaryForm, bonusAmount: e.target.value })} fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                helperText="Leave as 0 for regular salary payment" />
            </Grid>
            <Grid item xs={12}>
              <TextField select label="Payment Method" value={salaryForm.paymentMethod}
                onChange={e => setSalaryForm({ ...salaryForm, paymentMethod: e.target.value })} fullWidth>
                {["Direct Deposit", "Check", "Zelle", "Cash"].map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField label="Notes" value={salaryForm.notes}
                onChange={e => setSalaryForm({ ...salaryForm, notes: e.target.value })} fullWidth multiline rows={2} />
            </Grid>
          </Grid>
          {salaryEmployee && (
            <Box sx={{ mt: 2, p: 2, bgcolor: "success.50", borderRadius: 1, border: "1px solid", borderColor: "success.main" }}>
              <Typography variant="h6" color="success.main" fontWeight="bold">
                Total Payment: ${(calcPerPeriod(salaryEmployee.annualSalary, salaryEmployee.paySchedule) + (parseFloat(salaryForm.bonusAmount) || 0)).toFixed(2)}
              </Typography>
              {parseFloat(salaryForm.bonusAmount) > 0 && (
                <Typography variant="caption" color="text.secondary">
                  ${calcPerPeriod(salaryEmployee.annualSalary, salaryEmployee.paySchedule).toFixed(2)} base + ${parseFloat(salaryForm.bonusAmount).toFixed(2)} bonus
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setSalaryDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="info" onClick={handlePaySalaryEmployee} startIcon={<PaymentIcon />}>
            Record Salary Payment
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}