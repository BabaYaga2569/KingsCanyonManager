import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  useTheme,
  useMediaQuery,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Alert,
  Checkbox,
  FormGroup,
  Grid,
  Divider,
  CircularProgress,
} from "@mui/material";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import SortIcon from "@mui/icons-material/Sort";
import SendIcon from "@mui/icons-material/Send";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import TouchAppIcon from "@mui/icons-material/TouchApp";
import EmailIcon from "@mui/icons-material/Email";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import generateContractPDF from "./pdf/generateContractPDF";
import logo from "./logo.svg";
import { cascadeCancelJob, buildCancelSummary, buildCancelConfirmationMessage } from "./utils/cascadeCancel";


export default function ContractsDashboard() {
  const [contracts, setContracts] = useState([]);
  const [sortedContracts, setSortedContracts] = useState([]);
  const [filteredContracts, setFilteredContracts] = useState([]);
  const [sortOrder, setSortOrder] = useState("newest");
  const [selectedYear, setSelectedYear] = useState("all");
  const [loading, setLoading] = useState(true);

  // Send for Signature dialog
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState(null);
  const [signingMode, setSigningMode] = useState("remote");
  const [customerEmail, setCustomerEmail] = useState("");

  // Schedule dialog
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleContract, setScheduleContract] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({
    startDate: "",
    startTime: "08:00",
    endDate: "",
    endTime: "17:00",
    selectedEmployees: [],
    selectedEquipment: [],
    notes: "",
    priority: "normal",
  });

  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const fetchContracts = async () => {
    try {
      const snap = await getDocs(collection(db, "contracts"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setContracts(data);
    } catch (error) {
      console.error("Error fetching contracts:", error);
      Swal.fire("Error", "Failed to load contracts.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, []);
  useEffect(() => {
   
  }, []);

  const parseContractDate = (contract) => {
    if (contract.createdAt) {
      if (contract.createdAt.toDate) return contract.createdAt.toDate();
      const parsed = new Date(contract.createdAt);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    if (contract.contractDate) {
      if (contract.contractDate.toDate) return contract.contractDate.toDate();
      const parsed = new Date(contract.contractDate);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date(0);
  };

  useEffect(() => {
    let sorted = [...contracts];
    switch (sortOrder) {
      case "newest":
        sorted.sort((a, b) => parseContractDate(b) - parseContractDate(a));
        break;
      case "oldest":
        sorted.sort((a, b) => parseContractDate(a) - parseContractDate(b));
        break;
      case "name-asc":
        sorted.sort((a, b) => (a.clientName || "").localeCompare(b.clientName || ""));
        break;
      case "name-desc":
        sorted.sort((a, b) => (b.clientName || "").localeCompare(a.clientName || ""));
        break;
      case "amount-high":
        sorted.sort((a, b) => (b.amount || 0) - (a.amount || 0));
        break;
      case "amount-low":
        sorted.sort((a, b) => (a.amount || 0) - (b.amount || 0));
        break;
      case "status-unsigned":
        sorted.sort((a, b) => {
          const aScore = a.clientSignature && a.contractorSignature ? 2 : a.clientSignature ? 1 : 0;
          const bScore = b.clientSignature && b.contractorSignature ? 2 : b.clientSignature ? 1 : 0;
          return aScore - bScore;
        });
        break;
      case "status-signed":
        sorted.sort((a, b) => {
          const aScore = a.clientSignature && a.contractorSignature ? 2 : a.clientSignature ? 1 : 0;
          const bScore = b.clientSignature && b.contractorSignature ? 2 : b.clientSignature ? 1 : 0;
          return bScore - aScore;
        });
        break;
      default:
        break;
    }

    if (selectedYear !== "all") {
      sorted = sorted.filter((c) => {
        const date = parseContractDate(c);
        return date.getFullYear().toString() === selectedYear;
      });
    }

    setSortedContracts(sorted);
  }, [contracts, sortOrder, selectedYear]);

  const handleDeleteContract = async (id, clientName) => {
    const confirm = await Swal.fire({
      title: "Delete Contract?",
      text: `Are you sure you want to delete ${clientName}'s contract?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it",
      cancelButtonText: "Cancel",
    });
    if (!confirm.isConfirmed) return;
    try {
      await deleteDoc(doc(db, "contracts", id));
      setContracts((prev) => prev.filter((c) => c.id !== id));
      Swal.fire("Deleted!", "The contract has been removed.", "success");
    } catch (error) {
      Swal.fire("Error", "Failed to delete contract.", "error");
    }
  };

  const handleCancelContract = async (contract) => {
    const result = await Swal.fire({
      title: "Cancel Contract?",
      html: buildCancelConfirmationMessage(contract.clientName, "contract"),
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Cancel Contract",
      confirmButtonColor: "#f44336",
      cancelButtonText: "No, Keep It",
    });

    if (result.isConfirmed) {
      try {
        const cancelResult = await cascadeCancelJob("contracts", contract.id);
        
        const summaryHtml = buildCancelSummary(cancelResult);
        
        await Swal.fire({
          icon: cancelResult.success ? "success" : "warning",
          title: cancelResult.success ? "Contract Cancelled" : "Partial Cancellation",
          html: summaryHtml,
          confirmButtonText: "OK",
        });
        
        fetchContracts();
      } catch (error) {
        console.error("Error cancelling contract:", error);
        Swal.fire("Error", "Failed to cancel contract. Check console for details.", "error");
      }
    }
  };

  const handleGeneratePDF = async (contract) => {
    try {
      const img = new Image();
      img.src = logo;
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const logoDataUrl = canvas.toDataURL("image/png");
        const pdf = await generateContractPDF(contract, logoDataUrl);
        const pdfBlob = pdf.output("blob");
        const blobUrl = URL.createObjectURL(pdfBlob);
        window.open(blobUrl, "_blank");
      };
    } catch (error) {
      console.error("PDF Generation Error:", error);
      Swal.fire("Error", "Failed to generate PDF.", "error");
    }
  };

  const handleViewEdit = (id) => {
    navigate(`/contract/${id}`);
  };

  const handleOpenSendDialog = (contract) => {
    setSelectedContract(contract);
    setCustomerEmail(contract.clientEmail || "");
    setSendDialogOpen(true);
  };

  const handleSendForSignature = async () => {
    if (signingMode === "remote" && !customerEmail) {
      Swal.fire("Email Required", "Please enter customer's email address.", "warning");
      return;
    }
    try {
      const token = selectedContract.signingToken || "";
      const signatureLink = token
        ? `${window.location.origin}/public/sign/${selectedContract.id}?token=${token}`
        : `${window.location.origin}/public/sign/${selectedContract.id}`;

      if (signingMode === "remote") {
        await updateDoc(doc(db, "contracts", selectedContract.id), {
          signatureLink,
          status: "Sent - Awaiting Client Signature",
          sentAt: new Date().toISOString(),
          clientEmail: customerEmail,
        });
        Swal.fire({
          icon: "success",
          title: "Contract Link Generated!",
          html: `
            <p><strong>Copy this link and text/email it to your customer:</strong></p>
            <textarea readonly onclick="this.select()" 
              style="width:100%; padding:10px; font-size:12px; margin:10px 0; border: 2px solid #1565c0; border-radius:4px;"
              rows="3">${signatureLink}</textarea>
            <p style="font-size:0.9em; color:#666; margin-top:10px;">
              📱 <strong>Text message example:</strong><br>
              "Hi ${selectedContract.clientName}, here's your contract to review and sign: ${signatureLink}"
            </p>
            <p style="font-size:0.85em; color:#999; margin-top:15px;">
              ✅ This link is SAFE - customer can ONLY see their contract, nothing else in your system
            </p>
          `,
          confirmButtonText: "OK",
          width: "600px",
        });
        fetchContracts();
      } else {
        navigate(`/contract/${selectedContract.id}`);
      }
      setSendDialogOpen(false);
    } catch (error) {
      console.error("Error sending contract:", error);
      Swal.fire("Error", "Failed to send contract.", "error");
    }
  };

  // ============================================
  // INLINE SCHEDULING
  // ============================================

  const handleOpenScheduleDialog = async (contract) => {
    setScheduleContract(contract);
    setScheduleForm({
      startDate: "",
      startTime: "08:00",
      endDate: "",
      endTime: "17:00",
      selectedEmployees: [],
      selectedEquipment: [],
      notes: contract.description || "",
      priority: "normal",
    });
    setConflicts([]);
    setScheduleDialogOpen(true);
    setScheduleLoading(true);

    try {
      // Load employees
      const empSnap = await getDocs(collection(db, "users"));
      const empData = empSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => e.active !== false);
      setEmployees(empData);

      // Load equipment
      const equipSnap = await getDocs(collection(db, "equipment"));
      const equipData = equipSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => e.status === "available" || e.status === undefined);
      setEquipment(equipData);
    } catch (error) {
      console.error("Error loading schedule data:", error);
    } finally {
      setScheduleLoading(false);
    }
  };

  const checkScheduleConflicts = async (date, selectedEmployees, selectedEquipment) => {
    if (!date) {
      setConflicts([]);
      return;
    }
    try {
      const schedulesSnap = await getDocs(collection(db, "schedules"));
      const existingSchedules = schedulesSnap.docs.map((d) => d.data());
      const newConflicts = [];

      selectedEmployees.forEach((employeeId) => {
        const employee = employees.find((e) => e.id === employeeId);
        const hasConflict = existingSchedules.some(
          (s) =>
            (s.assignedEmployees?.includes(employeeId) ||
              s.selectedEmployees?.includes(employeeId)) &&
            s.startDate === date
        );
        if (hasConflict) {
          newConflicts.push(`${employee?.name || "Employee"} is already scheduled on ${date}`);
        }
      });

      selectedEquipment.forEach((equipId) => {
        const equip = equipment.find((e) => e.id === equipId);
        const hasConflict = existingSchedules.some(
          (s) => s.selectedEquipment?.includes(equipId) && s.startDate === date
        );
        if (hasConflict) {
          newConflicts.push(`${equip?.name || "Equipment"} is already reserved on ${date}`);
        }
      });

      setConflicts(newConflicts);
    } catch (error) {
      console.error("Error checking conflicts:", error);
    }
  };

  const handleScheduleFormChange = (field, value) => {
    const updated = { ...scheduleForm, [field]: value };
    setScheduleForm(updated);

    // Re-check conflicts when date, employees, or equipment change
    if (field === "startDate" || field === "selectedEmployees" || field === "selectedEquipment") {
      checkScheduleConflicts(
        field === "startDate" ? value : updated.startDate,
        field === "selectedEmployees" ? value : updated.selectedEmployees,
        field === "selectedEquipment" ? value : updated.selectedEquipment
      );
    }
  };

  const handleEmployeeToggle = (employeeId) => {
    const updated = scheduleForm.selectedEmployees.includes(employeeId)
      ? scheduleForm.selectedEmployees.filter((id) => id !== employeeId)
      : [...scheduleForm.selectedEmployees, employeeId];
    handleScheduleFormChange("selectedEmployees", updated);
  };

  const handleEquipmentToggle = (equipId) => {
    const updated = scheduleForm.selectedEquipment.includes(equipId)
      ? scheduleForm.selectedEquipment.filter((id) => id !== equipId)
      : [...scheduleForm.selectedEquipment, equipId];
    handleScheduleFormChange("selectedEquipment", updated);
  };

  const handleSaveSchedule = async () => {
    if (!scheduleForm.startDate) {
      Swal.fire("Missing Info", "Please select a start date.", "warning");
      return;
    }

    if (conflicts.length > 0) {
      const result = await Swal.fire({
        title: "Scheduling Conflicts Detected",
        html: `<ul style="text-align:left">${conflicts.map((c) => `<li>${c}</li>`).join("")}</ul><p>Schedule anyway?</p>`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, Schedule Anyway",
        cancelButtonText: "Go Back",
      });
      if (!result.isConfirmed) return;
    }

    try {
      const scheduleData = {
        contractId: scheduleContract.id,
        customerId: scheduleContract.customerId || "",
        invoiceId: scheduleContract.invoiceId || "",
        jobId: scheduleContract.jobId || "",
        bidId: scheduleContract.bidId || "",
        clientName: scheduleContract.clientName || "Unknown",
        jobDescription: scheduleContract.description || "",
        customerAddress: scheduleContract.customerAddress || scheduleContract.address || "",
        startDate: scheduleForm.startDate,
        startTime: scheduleForm.startTime,
        endDate: scheduleForm.endDate || scheduleForm.startDate,
        endTime: scheduleForm.endTime,
        assignedEmployees: scheduleForm.selectedEmployees,
        selectedEquipment: scheduleForm.selectedEquipment,
        notes: scheduleForm.notes,
        priority: scheduleForm.priority,
        status: "scheduled",
        createdAt: serverTimestamp(),
      };

      const scheduleRef = await addDoc(collection(db, "schedules"), scheduleData);

      // Update contract with schedule reference
      await updateDoc(doc(db, "contracts", scheduleContract.id), {
        scheduleId: scheduleRef.id,
        scheduledDate: scheduleForm.startDate,
      });

      // Update equipment status
      for (const equipId of scheduleForm.selectedEquipment) {
        await updateDoc(doc(db, "equipment", equipId), { status: "in-use" });
      }

      setScheduleDialogOpen(false);

      Swal.fire({
        icon: "success",
        title: "Job Scheduled!",
        text: `${scheduleContract.clientName}'s job scheduled for ${scheduleForm.startDate}`,
        confirmButtonText: "OK",
      });

      fetchContracts();
    } catch (error) {
      console.error("Error scheduling job:", error);
      Swal.fire("Error", "Failed to schedule job.", "error");
    }
  };

  // ============================================
  // STATUS HELPERS
  // ============================================

  const getStatusColor = (contract) => {
    if (contract.clientSignature && contract.contractorSignature) return "success";
    if (contract.clientSignature) return "warning";
    if (contract.status === "Sent - Awaiting Client Signature") return "info";
    return "default";
  };

  const getStatusLabel = (contract) => {
    if (contract.clientSignature && contract.contractorSignature) return "Fully Signed";
    if (contract.clientSignature) return "Awaiting Owner Signature";
    if (contract.status === "Sent - Awaiting Client Signature") return "Sent - Not Signed Yet";
    return contract.status || "Pending";
  };

  const isFullySigned = (contract) => {
    return contract.clientSignature && contract.contractorSignature;
  };

  const isScheduled = (contract) => {
    return !!contract.scheduleId || !!contract.scheduledDate;
  };

  const canCancelContract = (contract) => {
    return contract.status !== "cancelled" && contract.status !== "completed";
  };

  const getAvailableYears = () => {
    const years = new Set();
    contracts.forEach((contract) => {
      const date = parseContractDate(contract);
      if (date.getTime() > 0) years.add(date.getFullYear().toString());
    });
    return Array.from(years).sort((a, b) => b - a);
  };

  const formatDate = (contract) => {
    if (contract.createdAt) {
      if (contract.createdAt.toDate) return contract.createdAt.toDate().toLocaleDateString();
      const p = new Date(contract.createdAt);
      if (!isNaN(p.getTime())) return p.toLocaleDateString();
    }
    if (contract.contractDate) {
      if (contract.contractDate.toDate) return contract.contractDate.toDate().toLocaleDateString();
      const p = new Date(contract.contractDate);
      if (!isNaN(p.getTime())) return p.toLocaleDateString();
    }
    return "—";
  };

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading contracts...</Typography>
      </Box>
    );
  }

  // ============================================
  // SORT / YEAR FILTER (shared)
  // ============================================
  const SortYearControls = () => (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
      <Typography variant="h5">Contracts Dashboard ({sortedContracts.length})</Typography>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="year-label">Year</InputLabel>
          <Select labelId="year-label" value={selectedYear} label="Year" onChange={(e) => setSelectedYear(e.target.value)}>
            <MenuItem value="all">All Years</MenuItem>
            {getAvailableYears().map((year) => (
              <MenuItem key={year} value={year}>{year}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="sort-label">
            <SortIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: "middle" }} /> Sort By
          </InputLabel>
          <Select labelId="sort-label" value={sortOrder} label="Sort By" onChange={(e) => setSortOrder(e.target.value)}>
            <MenuItem value="newest">Newest First</MenuItem>
            <MenuItem value="oldest">Oldest First</MenuItem>
            <MenuItem value="name-asc">Name (A-Z)</MenuItem>
            <MenuItem value="name-desc">Name (Z-A)</MenuItem>
            <MenuItem value="amount-high">Highest Amount</MenuItem>
            <MenuItem value="amount-low">Lowest Amount</MenuItem>
            <MenuItem value="status-unsigned">Unsigned First</MenuItem>
            <MenuItem value="status-signed">Signed First</MenuItem>
          </Select>
        </FormControl>
      </Box>
    </Box>
  );

  // ============================================
  // SCHEDULE DIALOG (shared between mobile/desktop)
  // ============================================
  const ScheduleDialog = () => (
    <Dialog open={scheduleDialogOpen} onClose={() => setScheduleDialogOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CalendarTodayIcon color="primary" />
          Schedule Job — {scheduleContract?.clientName}
        </Box>
      </DialogTitle>
      <DialogContent>
        {scheduleLoading ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Alert severity="info" sx={{ mb: 3, mt: 1 }}>
              <strong>Client:</strong> {scheduleContract?.clientName}<br />
              <strong>Job:</strong> {scheduleContract?.description || "N/A"}<br />
              <strong>Amount:</strong> ${Number(scheduleContract?.amount || 0).toFixed(2)}
            </Alert>

            {/* Date / Time */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Start Date *"
                  type="date"
                  value={scheduleForm.startDate}
                  onChange={(e) => handleScheduleFormChange("startDate", e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Start Time"
                  type="time"
                  value={scheduleForm.startTime}
                  onChange={(e) => handleScheduleFormChange("startTime", e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="End Date (optional)"
                  type="date"
                  value={scheduleForm.endDate}
                  onChange={(e) => handleScheduleFormChange("endDate", e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  helperText="Leave blank for single-day job"
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="End Time"
                  type="time"
                  value={scheduleForm.endTime}
                  onChange={(e) => handleScheduleFormChange("endTime", e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            {/* Employees */}
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              👥 Assign Employees
            </Typography>
            {employees.length > 0 ? (
              <FormGroup>
                <Grid container spacing={1}>
                  {employees.map((emp) => (
                    <Grid item xs={12} sm={6} md={4} key={emp.id}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={scheduleForm.selectedEmployees.includes(emp.id)}
                            onChange={() => handleEmployeeToggle(emp.id)}
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2">{emp.name}</Typography>
                            {emp.jobTitle && (
                              <Typography variant="caption" color="text.secondary">{emp.jobTitle}</Typography>
                            )}
                          </Box>
                        }
                      />
                    </Grid>
                  ))}
                </Grid>
              </FormGroup>
            ) : (
              <Alert severity="info" sx={{ mb: 2 }}>No employees found.</Alert>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Equipment */}
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
              🚛 Reserve Equipment
            </Typography>
            {equipment.length > 0 ? (
              <FormGroup>
                <Grid container spacing={1}>
                  {equipment.map((equip) => (
                    <Grid item xs={12} sm={6} md={4} key={equip.id}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={scheduleForm.selectedEquipment.includes(equip.id)}
                            onChange={() => handleEquipmentToggle(equip.id)}
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2">{equip.name}</Typography>
                            {equip.type && (
                              <Typography variant="caption" color="text.secondary">{equip.type}</Typography>
                            )}
                          </Box>
                        }
                      />
                    </Grid>
                  ))}
                </Grid>
              </FormGroup>
            ) : (
              <Alert severity="info" sx={{ mb: 2 }}>No equipment available.</Alert>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Priority & Notes */}
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Priority</InputLabel>
                  <Select
                    value={scheduleForm.priority}
                    label="Priority"
                    onChange={(e) => handleScheduleFormChange("priority", e.target.value)}
                  >
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="normal">Normal</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="urgent">Urgent</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Notes"
                  value={scheduleForm.notes}
                  onChange={(e) => handleScheduleFormChange("notes", e.target.value)}
                  multiline
                  rows={3}
                  placeholder="Special instructions, access notes, etc."
                  fullWidth
                />
              </Grid>
            </Grid>

            {/* Conflicts */}
            {conflicts.length > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>⚠️ Conflicts:</Typography>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleSaveSchedule}
          disabled={!scheduleForm.startDate || scheduleLoading}
          startIcon={<CalendarTodayIcon />}
          size="large"
        >
          Schedule Job
        </Button>
      </DialogActions>
    </Dialog>
  );

  // ============================================
  // SEND DIALOG (shared)
  // ============================================
  const SendDialog = () => (
    <Dialog open={sendDialogOpen} onClose={() => setSendDialogOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Send Contract for Signature</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 3 }}>
          <strong>Customer:</strong> {selectedContract?.clientName}<br />
          <strong>Amount:</strong> ${selectedContract?.amount?.toFixed(2)}<br />
          <strong>Deposit (50%):</strong> ${(selectedContract?.amount * 0.5)?.toFixed(2)}
        </Alert>
        <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
          How will this contract be signed?
        </Typography>
        <RadioGroup value={signingMode} onChange={(e) => setSigningMode(e.target.value)}>
          <FormControlLabel
            value="in-person"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="subtitle2">👋 Sign Now (In-Person)</Typography>
                <Typography variant="caption" color="text.secondary">Customer is here — hand them the tablet</Typography>
              </Box>
            }
          />
          <FormControlLabel
            value="remote"
            control={<Radio />}
            label={
              <Box>
                <Typography variant="subtitle2">📧 Send Signature Link (Remote)</Typography>
                <Typography variant="caption" color="text.secondary">Email a link — customer signs from their phone</Typography>
              </Box>
            }
          />
        </RadioGroup>
        {signingMode === "remote" && (
          <TextField
            label="Customer Email"
            type="email"
            fullWidth
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            sx={{ mt: 3 }}
            placeholder="customer@example.com"
            helperText="We'll email the signature link to this address"
            required
          />
        )}
      </DialogContent>
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={() => setSendDialogOpen(false)}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSendForSignature}
          startIcon={signingMode === "in-person" ? <TouchAppIcon /> : <EmailIcon />}
          size="large"
        >
          {signingMode === "in-person" ? "Open Contract to Sign" : "Send Signature Email"}
        </Button>
      </DialogActions>
    </Dialog>
  );

  // ============================================
  // MOBILE VIEW
  // ============================================
  if (isMobile) {
    return (
      <Box sx={{ p: 2 }}>
        <SortYearControls />

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
          {sortedContracts.map((contract) => (
            <Card 
              key={contract.id} 
              sx={{ 
                boxShadow: 3,
                opacity: contract.status === "cancelled" ? 0.6 : 1,
                backgroundColor: contract.status === "cancelled" ? "#f5f5f5" : "white"
              }}
            >
              <CardContent>
                <Typography 
                  variant="h6" 
                  gutterBottom
                  sx={{
                    textDecoration: contract.status === "cancelled" ? "line-through" : "none",
                    color: contract.status === "cancelled" ? "#999" : "inherit"
                  }}
                >
                  {contract.clientName || "Unnamed Client"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Date: {formatDate(contract)}
                </Typography>
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  Amount: ${Number(contract.amount || 0).toFixed(2)}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Chip label={getStatusLabel(contract)} color={getStatusColor(contract)} sx={{ mt: 1 }} />
                  {isScheduled(contract) && (
                    <Chip label={`📅 ${contract.scheduledDate || "Scheduled"}`} color="info" variant="outlined" sx={{ mt: 1 }} />
                  )}
                </Box>
              </CardContent>
              <CardActions sx={{ display: "flex", flexDirection: "column", gap: 1, p: 2 }}>
                {contract.clientSignature && !contract.contractorSignature && (
                  <Button variant="contained" color="warning" fullWidth startIcon={<TouchAppIcon />} onClick={() => handleViewEdit(contract.id)}>
                    Sign Now (Darren)
                  </Button>
                )}
                <Button variant="outlined" fullWidth startIcon={<SendIcon />} onClick={() => handleViewEdit(contract.id)}>
                  Email / Sign
                </Button>
                <Button variant="outlined" fullWidth startIcon={<PictureAsPdfIcon />} onClick={() => handleGeneratePDF(contract)}>
                  View PDF
                </Button>
                <Button variant="outlined" fullWidth startIcon={<EditIcon />} onClick={() => handleViewEdit(contract.id)}>
                  View / Edit
                </Button>
                {isFullySigned(contract) && !isScheduled(contract) && (
                  <Button variant="contained" color="success" fullWidth startIcon={<CalendarTodayIcon />} onClick={() => handleOpenScheduleDialog(contract)}>
                    Schedule Job
                  </Button>
                )}
                {isScheduled(contract) && (
                  <Chip icon={<CheckCircleIcon />} label={`Scheduled: ${contract.scheduledDate}`} color="success" variant="outlined" sx={{ width: "100%" }} />
                )}
                {canCancelContract(contract) && (
                  <Button 
                    variant="outlined" 
                    color="warning" 
                    fullWidth 
                    startIcon={<CancelIcon />} 
                    onClick={() => handleCancelContract(contract)}
                  >
                    Cancel Contract
                  </Button>
                )}
                <Button variant="outlined" color="error" fullWidth startIcon={<DeleteIcon />} onClick={() => handleDeleteContract(contract.id, contract.clientName || "this")}>
                  Delete
                </Button>
              </CardActions>
            </Card>
          ))}
        </Box>
        
        <ScheduleDialog />
      </Box>
    );
  }

  // ============================================
  // DESKTOP VIEW
  // ============================================
  return (
    <Box sx={{ p: 3 }}>
      <SortYearControls />

      <TableContainer component={Paper} sx={{ mt: 2, borderRadius: 2, overflowX: "auto", boxShadow: 3 }}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: "#f5f5f5" }}>
              <TableCell sx={{ fontWeight: "bold" }}>Client</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Date</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Amount</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Status</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedContracts.map((contract) => (
              <TableRow 
                key={contract.id}
                sx={{
                  opacity: contract.status === "cancelled" ? 0.6 : 1,
                  backgroundColor: contract.status === "cancelled" ? "#f5f5f5" : "inherit"
                }}
              >
                <TableCell
                  sx={{
                    textDecoration: contract.status === "cancelled" ? "line-through" : "none",
                    color: contract.status === "cancelled" ? "#999" : "inherit"
                  }}
                >
                  {contract.clientName || "Unnamed Client"}
                </TableCell>
                <TableCell>{formatDate(contract)}</TableCell>
                <TableCell>${Number(contract.amount || 0).toFixed(2)}</TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <Chip label={getStatusLabel(contract)} color={getStatusColor(contract)} size="small" />
                    {isScheduled(contract) && (
                      <Chip label={`📅 ${contract.scheduledDate || "Scheduled"}`} color="info" variant="outlined" size="small" />
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  {contract.clientSignature && !contract.contractorSignature && (
                    <Button variant="contained" color="warning" size="small" startIcon={<TouchAppIcon />} onClick={() => handleViewEdit(contract.id)} sx={{ mr: 1, mb: { xs: 1, lg: 0 } }}>
                      Sign Now
                    </Button>
                  )}
                  <Button variant="outlined" size="small" startIcon={<EmailIcon />} onClick={() => handleViewEdit(contract.id)} sx={{ mr: 1, mb: { xs: 1, lg: 0 } }}>
                    Email
</Button>
                  <Button variant="outlined" size="small" startIcon={<PictureAsPdfIcon />} onClick={() => handleGeneratePDF(contract)} sx={{ mr: 1, mb: { xs: 1, lg: 0 } }}>
                    PDF
                  </Button>
                  <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => handleViewEdit(contract.id)} sx={{ mr: 1, mb: { xs: 1, lg: 0 } }}>
                    View / Edit
                  </Button>
                  {isFullySigned(contract) && !isScheduled(contract) && (
                    <Button variant="contained" color="success" size="small" startIcon={<CalendarTodayIcon />} onClick={() => handleOpenScheduleDialog(contract)} sx={{ mr: 1, mb: { xs: 1, lg: 0 } }}>
                      Schedule
                    </Button>
                  )}
                  {isScheduled(contract) && (
                    <Chip icon={<CheckCircleIcon />} label={contract.scheduledDate} color="success" variant="outlined" size="small" sx={{ mr: 1 }} />
                  )}
                  {canCancelContract(contract) && (
                    <Button 
                      variant="outlined" 
                      color="warning" 
                      size="small" 
                      startIcon={<CancelIcon />} 
                      onClick={() => handleCancelContract(contract)} 
                      sx={{ mr: 1, mb: { xs: 1, lg: 0 } }}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button variant="outlined" color="error" size="small" startIcon={<DeleteIcon />} onClick={() => handleDeleteContract(contract.id, contract.clientName || "this")} sx={{ mb: { xs: 1, lg: 0 } }}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      
      <ScheduleDialog />
    </Box>
  );
}