import React, { useState, useEffect } from "react";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, storage } from "./firebase";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Container,
  Typography,
  Button,
  Box,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  FormControlLabel,
  Checkbox,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  IconButton,
  InputAdornment,
  CircularProgress,
  Alert,
  useMediaQuery,
  useTheme,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  List,
  ListItem,
  ListItemText,
  Autocomplete,
} from "@mui/material";
import Swal from "sweetalert2";
import AddIcon from "@mui/icons-material/Add";
import ReceiptIcon from "@mui/icons-material/Receipt";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import VisibilityIcon from "@mui/icons-material/Visibility";
import FilterListIcon from "@mui/icons-material/FilterList";
import SortIcon from "@mui/icons-material/Sort";
import DownloadIcon from "@mui/icons-material/Download";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BugReportIcon from "@mui/icons-material/BugReport";
import moment from "moment";
import { markAsViewed } from './useNotificationCounts';

// Initialize Firebase Functions
const functions = getFunctions();

// AI Receipt Scanner using Firebase Cloud Function
const scanReceipt = async (file) => {
  console.log("=".repeat(80));
  console.log("ðŸ” RECEIPT SCAN STARTED (Cloud Function)");
  console.log("=".repeat(80));
  console.log("ðŸ“ File:", file.name);
  console.log("ðŸ“Š Size:", (file.size / 1024).toFixed(2), "KB");
  console.log("ðŸŽ¨ Type:", file.type);
  
  return new Promise(async (resolve, reject) => {
    try {
      // Upload to Firebase Storage first
      const timestamp = Date.now();
      const fileName = `receipt_${timestamp}_${file.name}`;
      const storageRef = ref(storage, `receipts/expenses/${fileName}`);
      
      console.log("â˜ï¸ Uploading to Firebase Storage...");
      await uploadBytes(storageRef, file);
      const receiptUrl = await getDownloadURL(storageRef);
      console.log("âœ… Firebase upload complete");
      console.log("ðŸ”— Receipt URL:", receiptUrl);
      
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        console.log("ðŸ“„ File read successfully");
        const base64Image = e.target.result.split(',')[1];
        console.log("ðŸ“¸ Base64 length:", base64Image.length, "characters");
        
        try {
          console.log("-".repeat(80));
          console.log("â˜ï¸ CALLING FIREBASE CLOUD FUNCTION");
          console.log("-".repeat(80));
          
          // Call Firebase Cloud Function
          const scanReceiptFunction = httpsCallable(functions, 'scanReceipt');
          
          console.log("ðŸ“¤ Sending to Cloud Function...");
          const result = await scanReceiptFunction({ image: base64Image });
          
          console.log("âœ… Cloud Function returned successfully");
          console.log("ðŸ“¦ Result:", JSON.stringify(result.data, null, 2));
          
          const data = result.data;
          
          const finalResult = {
            vendor: data.vendor || "Unknown Vendor",
            amount: data.amount || 0,
            subtotal: data.subtotal || 0,
            tax: data.tax || 0,
            date: data.date || moment().format("YYYY-MM-DD"),
            receiptNumber: data.receiptNumber || "",
            category: data.category || "materials",
            lineItems: data.lineItems || [],
            receiptUrl: receiptUrl,
            scanSuccess: true,
            rawText: data.rawText, // For debugging
          };
          
          console.log("=".repeat(80));
          console.log("🎉 SCAN COMPLETE - SUCCESS!");
          console.log("=".repeat(80));
          console.log("Final result:", JSON.stringify(finalResult, null, 2));
          
          resolve(finalResult);
          
        } catch (functionError) {
          console.error("=".repeat(80));
          console.error("âŒ CLOUD FUNCTION CALL FAILED");
          console.error("=".repeat(80));
          console.error("Error:", functionError);
          console.error("Message:", functionError.message);
          console.error("Code:", functionError.code);
          console.error("Details:", functionError.details);
          
          // Return with error but still include receipt URL
          resolve({
            vendor: "",
            amount: "",
            subtotal: "",
            tax: "",
            date: moment().format("YYYY-MM-DD"),
            receiptNumber: "",
            category: "materials",
            lineItems: [],
            receiptUrl: receiptUrl,
            scanSuccess: false,
            scanError: functionError.message || "Cloud Function failed",
            errorCode: functionError.code,
          });
        }
      };
      
      reader.onerror = () => {
        console.error("âŒ File read failed");
        reject(new Error("Failed to read file"));
      };
      
      reader.readAsDataURL(file);
      
    } catch (error) {
      console.error("âŒ CRITICAL ERROR:", error);
      reject(error);
    }
  });
};

export default function ExpensesManager() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState([]);
  const [sortedExpenses, setSortedExpenses] = useState([]);
  const [sortOrder, setSortOrder] = useState("newest");
  const [jobs, setJobs] = useState([]);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [editExpenseOpen, setEditExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scannedData, setScannedData] = useState(null);
  const [showItemizedView, setShowItemizedView] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [expandedExpenseId, setExpandedExpenseId] = useState(null);

  const [expenseForm, setExpenseForm] = useState({
    type: "material",
    amount: "",
    vendor: "",
    category: "materials",
    date: moment().format("YYYY-MM-DD"),
    description: "",
    jobId: "",
    jobName: "",
    taxDeductible: true,
    paymentMethod: "credit_card",
    notes: "",
    receiptFile: null,
    receiptUrl: "",
    receiptFileName: "",
    lineItems: [],
  });

  const [selectedYear, setSelectedYear] = useState("all");
  const [filters, setFilters] = useState({
    startDate: "2020-01-01", // Show all expenses - very wide date range
    endDate: "2030-12-31",   // Show all expenses - very wide date range
    category: "all",
    jobId: "all",
    taxDeductible: "all",
  });

  // Handle year selection
  const handleYearChange = (year) => {
    setSelectedYear(year);
    if (year === "all") {
      setFilters({
        ...filters,
        startDate: "2020-01-01",
        endDate: "2030-12-31",
      });
    } else {
      setFilters({
        ...filters,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
      });
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ── Auto-open add expense form pre-filled when coming from a job ──
  useEffect(() => {
    const jobIdParam = searchParams.get("jobId");
    const jobNameParam = searchParams.get("jobName");
    const editParam = searchParams.get("edit");

    if (jobIdParam && !editParam) {
      // Coming from JobExpenses "Add Expense" button — pre-fill and open immediately
      setExpenseForm((prev) => ({
        ...prev,
        jobId: jobIdParam,
        jobName: jobNameParam ? decodeURIComponent(jobNameParam) : "",
      }));
      setAddExpenseOpen(true);
    }
  }, [searchParams]);
  useEffect(() => {
    markAsViewed('expenses');
  }, []);

  // Sort expenses whenever expenses or sortOrder changes
  useEffect(() => {
    const sorted = [...expenses].sort((a, b) => {
      switch (sortOrder) {
        case "newest":
          return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
        case "oldest":
          return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
        case "amount-high":
          return parseFloat(b.amount || 0) - parseFloat(a.amount || 0);
        case "amount-low":
          return parseFloat(a.amount || 0) - parseFloat(b.amount || 0);
        case "vendor-asc":
          return (a.vendor || "").localeCompare(b.vendor || "");
        case "vendor-desc":
          return (b.vendor || "").localeCompare(a.vendor || "");
        case "category":
          return (a.category || "").localeCompare(b.category || "");
        default:
          return 0;
      }
    });
    setSortedExpenses(sorted);
  }, [expenses, sortOrder]);

  const loadData = async () => {
    try {
      const expensesSnap = await getDocs(collection(db, "expenses"));
      const expensesData = expensesSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setExpenses(expensesData);

      const jobsSnap = await getDocs(collection(db, "jobs"));
      const jobsData = jobsSnap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setJobs(jobsData);

      setLoading(false);
    } catch (error) {
      console.error("Error loading expenses:", error);
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setExpenseForm({
        ...expenseForm,
        receiptFile: file,
        receiptFileName: file.name,
      });
    }
  };

  // ── HELPER: Get display description for an expense ──────────────────────
  const getDisplayDescription = (expense) => {
    if (expense.description && expense.description.trim()) return expense.description.trim();
    if (expense.lineItems && expense.lineItems.length > 0) {
      return expense.lineItems
        .slice(0, 4)
        .map(i => i.item || i.description || String(i))
        .filter(Boolean)
        .join(', ');
    }
    return null;
  };

  const toggleExpanded = (id) => {
    setExpandedExpenseId(prev => prev === id ? null : id);
  };

  // Receipt Scanner Handler
  const handleScanReceipt = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log("ðŸ‘‰ User selected file for scanning");
    
    // Set debug info for mobile display
    setDebugInfo({
      status: "Starting scan...",
      fileName: file.name,
      fileSize: (file.size / 1024).toFixed(2) + " KB",
      timestamp: new Date().toISOString(),
    });
    
    setScanning(true);
    setScanDialogOpen(true);

    try {
      const scannedInfo = await scanReceipt(file);
      
      console.log("ðŸ“‹ Setting scanned data state:", scannedInfo);
      setScannedData(scannedInfo);
      
      // Update debug info
      setDebugInfo({
        status: scannedInfo.scanSuccess ? "âœ… Success" : "âŒ Failed",
        fileName: file.name,
        fileSize: (file.size / 1024).toFixed(2) + " KB",
        vendor: scannedInfo.vendor,
        amount: scannedInfo.amount,
        itemCount: scannedInfo.lineItems?.length || 0,
        error: scannedInfo.scanError || null,
        timestamp: new Date().toISOString(),
      });
      
      // Pre-fill the form
      setExpenseForm({
        ...expenseForm,
        vendor: scannedInfo.vendor || "",
        category: scannedInfo.category?.toLowerCase() || "materials",
        amount: scannedInfo.amount || "",
        date: scannedInfo.date || moment().format("YYYY-MM-DD"),
        description: scannedInfo.description || "",
        receiptUrl: scannedInfo.receiptUrl || "",
        receiptFile: file,
        receiptFileName: file.name,
        lineItems: scannedInfo.lineItems || [],
      });

      setScanning(false);
      setScanDialogOpen(false);
      
      // Show itemized view if we have line items
      if (scannedInfo.lineItems && scannedInfo.lineItems.length > 0) {
        setShowItemizedView(true);
      }
      
      // Open expense form
      setAddExpenseOpen(true);
      
    } catch (error) {
      console.error("Receipt scan error:", error);
      
      // Update debug info with error
      setDebugInfo({
        status: "âŒ Error",
        fileName: file.name,
        fileSize: (file.size / 1024).toFixed(2) + " KB",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      
      setScanning(false);
      setScanDialogOpen(false);
      
      Swal.fire({
        icon: "error",
        title: "Scan Failed",
        text: error.message || "Could not scan receipt. Please enter manually.",
        footer: '<a href="#" onclick="console.log(\'Check console for details\')">Check browser console for details</a>'
      });
    }
  };

  const handleAddExpense = async () => {
    console.log("=".repeat(80));
    console.log("ðŸ’¾ SAVE EXPENSE CLICKED");
    console.log("=".repeat(80));
    
    if (!expenseForm.amount || !expenseForm.vendor) {
      console.log("âŒ Validation failed");
      Swal.fire("Missing Info", "Amount and Vendor are required", "warning");
      return;
    }

    console.log("âœ… Validation passed");
    console.log("ðŸ“‹ Form data:", expenseForm);
    setUploading(true);

    try {
      console.log("ðŸ“¤ Starting save...");
      let receiptUrl = expenseForm.receiptUrl;

      if (expenseForm.receiptFile && !receiptUrl) {
        console.log("ðŸ“¸ Uploading receipt...");
        const timestamp = Date.now();
        const fileName = `receipt_${timestamp}_${expenseForm.receiptFileName}`;
        const storageRef = ref(storage, `receipts/expenses/${fileName}`);
        await uploadBytes(storageRef, expenseForm.receiptFile);
        receiptUrl = await getDownloadURL(storageRef);
        console.log("✅ Receipt uploaded");
      }

      const expenseData = {
        type: expenseForm.type,
        amount: parseFloat(expenseForm.amount),
        vendor: expenseForm.vendor,
        category: expenseForm.category,
        date: expenseForm.date,
        description: expenseForm.description,
        jobId: expenseForm.jobId || null,
        jobName: expenseForm.jobName || "General Business Expense",
        customerId: null,
        taxDeductible: expenseForm.taxDeductible,
        paymentMethod: expenseForm.paymentMethod,
        notes: expenseForm.notes,
        receiptUrl: receiptUrl,
        receiptFileName: expenseForm.receiptFileName,
        lineItems: expenseForm.lineItems || [],
        createdAt: new Date().toISOString(),
      };

      // If linked to a job, get the customerId from the job
      if (expenseForm.jobId) {
        const linkedJob = jobs.find(j => j.id === expenseForm.jobId);
        if (linkedJob) {
          expenseData.customerId = linkedJob.customerId || null;
        }
      }

      console.log("ðŸ’¾ Saving to Firestore...");
      const docRef = await addDoc(collection(db, "expenses"), expenseData);
      console.log("âœ… SAVED! Doc ID:", docRef.id);

      // Update job expenses if linked
      if (expenseForm.jobId) {
        console.log("ðŸ”— Updating job...");
        const jobRef = doc(db, "jobs", expenseForm.jobId);
        const job = jobs.find((j) => j.id === expenseForm.jobId);
        const currentExpenses = job?.totalExpenses || 0;
        const newTotal = currentExpenses + parseFloat(expenseForm.amount);
        await updateDoc(jobRef, {
          totalExpenses: newTotal,
          expenseCount: (job?.expenseCount || 0) + 1,
        });
        console.log("âœ… Job updated");
      }

      console.log("ðŸŽ‰ SUCCESS!");
      Swal.fire({
        icon: "success",
        title: "Expense Added!",
        text: `$${parseFloat(expenseForm.amount).toFixed(2)} expense recorded`,
        timer: 2000,
      });

      console.log("ðŸ”„ Reloading data...");
      await loadData();
      console.log("âœ… Data reloaded");

      setAddExpenseOpen(false);
      setShowItemizedView(false);
      setDebugInfo(null);
      setExpenseForm({
        type: "material",
        amount: "",
        vendor: "",
        category: "materials",
        date: moment().format("YYYY-MM-DD"),
        description: "",
        jobId: "",
        jobName: "",
        taxDeductible: true,
        paymentMethod: "credit_card",
        notes: "",
        receiptFile: null,
        receiptUrl: "",
        receiptFileName: "",
        lineItems: [],
      });
      setScannedData(null);
      setUploading(false);
      
      console.log("=".repeat(80));
    } catch (error) {
      console.log("=".repeat(80));
      console.error("âŒ SAVE FAILED!");
      console.error("Error:", error);
      console.error("Message:", error.message);
      console.error("Code:", error.code);
      console.log("=".repeat(80));
      Swal.fire("Error", `Failed: ${error.message}`, "error");
      setUploading(false);
    }
  };

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    setExpenseForm({
      type: expense.type || "material",
      amount: expense.amount || "",
      vendor: expense.vendor || "",
      category: expense.category || "",
      date: expense.date || moment().format("YYYY-MM-DD"),
      description: expense.description || "",
      jobId: expense.jobId || "",
      jobName: expense.jobName || "",
      taxDeductible: expense.taxDeductible !== false,
      paymentMethod: expense.paymentMethod || "credit_card",
      notes: expense.notes || "",
      receiptFile: null,
      receiptUrl: expense.receiptUrl || "",
      receiptFileName: expense.receiptFileName || "",
      lineItems: expense.lineItems || [],
    });
    
    if (expense.lineItems && expense.lineItems.length > 0) {
      setShowItemizedView(true);
    }
    
    setEditExpenseOpen(true);
  };

  const handleUpdateExpense = async () => {
    if (!expenseForm.amount || !expenseForm.vendor) {
      Swal.fire("Missing Info", "Amount and Vendor are required", "warning");
      return;
    }

    setUploading(true);

    try {
      let receiptUrl = expenseForm.receiptUrl;

      if (expenseForm.receiptFile) {
        const timestamp = Date.now();
        const fileName = `receipt_${timestamp}_${expenseForm.receiptFileName}`;
        const storageRef = ref(storage, `receipts/expenses/${fileName}`);
        await uploadBytes(storageRef, expenseForm.receiptFile);
        receiptUrl = await getDownloadURL(storageRef);
      }

      const oldJobId = editingExpense.jobId;
      const newJobId = expenseForm.jobId || null;
      const oldAmount = parseFloat(editingExpense.amount || 0);
      const newAmount = parseFloat(expenseForm.amount);

      const expenseData = {
        type: expenseForm.type,
        amount: newAmount,
        vendor: expenseForm.vendor,
        category: expenseForm.category,
        date: expenseForm.date,
        description: expenseForm.description,
        jobId: newJobId,
        jobName: expenseForm.jobName || "General Business Expense",
        customerId: null,
        taxDeductible: expenseForm.taxDeductible,
        paymentMethod: expenseForm.paymentMethod,
        notes: expenseForm.notes,
        receiptUrl: receiptUrl,
        receiptFileName: expenseForm.receiptFileName,
        lineItems: expenseForm.lineItems || [],
      };

      // If linked to a job, get the customerId from the job
      if (newJobId) {
        const linkedJob = jobs.find(j => j.id === newJobId);
        if (linkedJob) {
          expenseData.customerId = linkedJob.customerId || null;
        }
      }

      await updateDoc(doc(db, "expenses", editingExpense.id), expenseData);

      // Update job totals
      if (oldJobId && oldJobId === newJobId) {
        const jobRef = doc(db, "jobs", oldJobId);
        const job = jobs.find((j) => j.id === oldJobId);
        const currentExpenses = job?.totalExpenses || 0;
        const difference = newAmount - oldAmount;
        await updateDoc(jobRef, {
          totalExpenses: currentExpenses + difference,
        });
      } else {
        if (oldJobId) {
          const oldJobRef = doc(db, "jobs", oldJobId);
          const oldJob = jobs.find((j) => j.id === oldJobId);
          const oldTotal = oldJob?.totalExpenses || 0;
          await updateDoc(oldJobRef, {
            totalExpenses: Math.max(0, oldTotal - oldAmount),
            expenseCount: Math.max(0, (oldJob?.expenseCount || 1) - 1),
          });
        }
        if (newJobId) {
          const newJobRef = doc(db, "jobs", newJobId);
          const newJob = jobs.find((j) => j.id === newJobId);
          const newTotal = newJob?.totalExpenses || 0;
          await updateDoc(newJobRef, {
            totalExpenses: newTotal + newAmount,
            expenseCount: (newJob?.expenseCount || 0) + 1,
          });
        }
      }

      Swal.fire({
        icon: "success",
        title: "Expense Updated!",
        timer: 2000,
      });

      setEditExpenseOpen(false);
      setShowItemizedView(false);
      setDebugInfo(null);
      setEditingExpense(null);
      setExpenseForm({
        type: "material",
        amount: "",
        vendor: "",
        category: "materials",
        date: moment().format("YYYY-MM-DD"),
        description: "",
        jobId: "",
        jobName: "",
        taxDeductible: true,
        paymentMethod: "credit_card",
        notes: "",
        receiptFile: null,
        receiptUrl: "",
        receiptFileName: "",
        lineItems: [],
      });
      setScannedData(null);
      setUploading(false);
      loadData();
    } catch (error) {
      console.error("Error updating expense:", error);
      Swal.fire("Error", "Failed to update expense", "error");
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: "Delete Expense?",
      text: "This action cannot be undone",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Yes, Delete",
    });

    if (result.isConfirmed) {
      try {
        const expense = expenses.find((e) => e.id === id);
        
        if (expense.jobId) {
          try {
            const jobRef = doc(db, "jobs", expense.jobId);
            const job = jobs.find((j) => j.id === expense.jobId);
            const currentExpenses = job?.totalExpenses || 0;
            const newTotal = Math.max(0, currentExpenses - parseFloat(expense.amount));
            await updateDoc(jobRef, {
              totalExpenses: newTotal,
              expenseCount: Math.max(0, (job?.expenseCount || 1) - 1),
            });
          } catch (jobErr) {
            // Job may have been deleted already — log and continue
            console.warn("Could not update job totals (job may be deleted):", jobErr.message);
          }
        }

        await deleteDoc(doc(db, "expenses", id));
        Swal.fire("Deleted!", "Expense has been deleted", "success");
        loadData();
      } catch (error) {
        console.error("Error deleting expense:", error);
        Swal.fire("Error", "Failed to delete expense", "error");
      }
    }
  };

  const handleExportCSV = () => {
    const csvData = filteredExpenses.map((e) => ({
      Date: e.date,
      Vendor: e.vendor,
      Amount: e.amount,
      Category: e.category,
      Job: e.jobName,
      TaxDeductible: e.taxDeductible ? "Yes" : "No",
      PaymentMethod: e.paymentMethod,
      Description: e.description,
      Notes: e.notes,
      Items: e.lineItems ? e.lineItems.length : 0,
    }));

    const headers = Object.keys(csvData[0]).join(",");
    const rows = csvData.map((row) => Object.values(row).join(","));
    const csv = [headers, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `expenses_${moment().format("YYYY-MM-DD")}.csv`;
    link.click();
  };

  // Apply filters
  const filteredExpenses = sortedExpenses.filter((expense) => {
    const expenseDate = moment(expense.date);
    const inDateRange =
      expenseDate.isSameOrAfter(filters.startDate) &&
      expenseDate.isSameOrBefore(filters.endDate);

    const categoryMatch =
      filters.category === "all" || expense.category === filters.category;

    const jobMatch =
      filters.jobId === "all" ||
      (filters.jobId === "" && !expense.jobId) ||
      expense.jobId === filters.jobId;

    const taxMatch =
      filters.taxDeductible === "all" ||
      (filters.taxDeductible === "yes" && expense.taxDeductible) ||
      (filters.taxDeductible === "no" && !expense.taxDeductible);

    return inDateRange && categoryMatch && jobMatch && taxMatch;
  });

  // Calculate totals
  const totalExpenses = filteredExpenses.reduce(
    (sum, e) => sum + parseFloat(e.amount || 0),
    0
  );
  const taxDeductibleTotal = filteredExpenses
    .filter((e) => e.taxDeductible)
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 3, textAlign: "center" }}>
        <CircularProgress />
      </Container>
    );
  }

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
        <Typography variant="h5">Expenses Manager</Typography>
        
        {/* Sort Dropdown */}
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
            <MenuItem value="amount-high">Highest Amount</MenuItem>
            <MenuItem value="amount-low">Lowest Amount</MenuItem>
            <MenuItem value="vendor-asc">Vendor (A-Z)</MenuItem>
            <MenuItem value="vendor-desc">Vendor (Z-A)</MenuItem>
            <MenuItem value="category">Category</MenuItem>
          </Select>
        </FormControl>
        
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {debugInfo && (
            <Button
              variant="text"
              startIcon={<BugReportIcon />}
              onClick={() => {
                Swal.fire({
                  title: "Debug Info",
                  html: `
                    <div style="text-align: left; font-family: monospace; font-size: 12px;">
                      <strong>Status:</strong> ${debugInfo.status}<br/>
                      <strong>File:</strong> ${debugInfo.fileName}<br/>
                      <strong>Size:</strong> ${debugInfo.fileSize}<br/>
                      <strong>Vendor:</strong> ${debugInfo.vendor || 'N/A'}<br/>
                      <strong>Amount:</strong> ${debugInfo.amount || 'N/A'}<br/>
                      <strong>Items:</strong> ${debugInfo.itemCount || 0}<br/>
                      <strong>Error:</strong> ${debugInfo.error || 'None'}<br/>
                      <strong>Time:</strong> ${new Date(debugInfo.timestamp).toLocaleString()}<br/>
                    </div>
                  `,
                  icon: debugInfo.status.includes('✅') ? 'success' : 'error',
                });
              }}
              size="small"
              color="secondary"
            >
              Debug
            </Button>
          )}
          
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportCSV}
            size="small"
          >
            {isMobile ? "CSV" : "Export CSV"}
          </Button>
          
          <Button
            variant="contained"
            startIcon={<CameraAltIcon />}
            component="label"
            disabled={scanning}
            color="primary"
          >
            {scanning ? "Scanning..." : isMobile ? "📸 Scan" : "📸 Scan Receipt"}
            <input
              type="file"
              hidden
              accept="image/*"
              capture="environment"
              onChange={handleScanReceipt}
            />
          </Button>
          
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setAddExpenseOpen(true)}
          >
            {isMobile ? "Manual" : "Manual Entry"}
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Total Expenses (Filtered)
              </Typography>
              <Typography variant="h4" color="error.main" sx={{ my: 1 }}>
                ${totalExpenses.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {filteredExpenses.length} expenses
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Tax Deductible
              </Typography>
              <Typography variant="h4" color="success.main" sx={{ my: 1 }}>
                ${taxDeductibleTotal.toFixed(2)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {filteredExpenses.filter((e) => e.taxDeductible).length} expenses
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                With Receipts
              </Typography>
              <Typography variant="h4" color="primary" sx={{ my: 1 }}>
                {filteredExpenses.filter((e) => e.receiptUrl).length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                of {filteredExpenses.length} total
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters - Same as before */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <FilterListIcon sx={{ mr: 1 }} />
          <Typography variant="h6">Filters</Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              label="Year"
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              fullWidth
              size="small"
            >
              <MenuItem value="all">All Years</MenuItem>
              <MenuItem value="2020">2020</MenuItem>
              <MenuItem value="2021">2021</MenuItem>
              <MenuItem value="2022">2022</MenuItem>
              <MenuItem value="2023">2023</MenuItem>
              <MenuItem value="2024">2024</MenuItem>
              <MenuItem value="2025">2025</MenuItem>
              <MenuItem value="2026">2026</MenuItem>
              <MenuItem value="2027">2027</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} sm={6} md={2.5}>
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

          <Grid item xs={12} sm={6} md={2.5}>
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

          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              label="Category"
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              fullWidth
              size="small"
            >
              <MenuItem value="all">All Categories</MenuItem>
              <MenuItem value="materials">Materials</MenuItem>
              <MenuItem value="fuel">Fuel</MenuItem>
              <MenuItem value="equipment">Equipment</MenuItem>
              <MenuItem value="labor">Labor</MenuItem>
              <MenuItem value="insurance">Insurance</MenuItem>
              <MenuItem value="tools">Tools</MenuItem>
              <MenuItem value="software">Software</MenuItem>
              <MenuItem value="vehicle">Vehicle</MenuItem>
              <MenuItem value="permits">Permits</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              label="Job"
              value={filters.jobId}
              onChange={(e) => setFilters({ ...filters, jobId: e.target.value })}
              fullWidth
              size="small"
            >
              <MenuItem value="all">All Jobs</MenuItem>
              <MenuItem value="">General Expenses</MenuItem>
              {jobs.map((job) => (
                <MenuItem key={job.id} value={job.id}>
                  {job.clientName}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              label="Tax Deductible"
              value={filters.taxDeductible}
              onChange={(e) => setFilters({ ...filters, taxDeductible: e.target.value })}
              fullWidth
              size="small"
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="yes">Yes</MenuItem>
              <MenuItem value="no">No</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* Expenses List - Mobile View */}
      {isMobile ? (
        <Box>
          {filteredExpenses.length === 0 ? (
            <Alert severity="info">No expenses found</Alert>
          ) : (
            filteredExpenses
              .map((expense) => (
                <Card key={expense.id} sx={{ mb: 2 }}>
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                      <Typography variant="h6">{expense.vendor}</Typography>
                      <Typography variant="h6" color="error.main">
                        ${parseFloat(expense.amount).toFixed(2)}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {moment(expense.date).format("MMM DD, YYYY")}
                    </Typography>
                    <Box sx={{ mt: 1, display: "flex", gap: 1, flexWrap: "wrap" }}>
                      <Chip label={expense.category} size="small" />
                      {expense.taxDeductible && (
                        <Chip label="Tax Deductible" color="success" size="small" />
                      )}
                      {expense.receiptUrl && (
                        <Chip icon={<ReceiptIcon />} label="Receipt" size="small" />
                      )}
                      {expense.lineItems && expense.lineItems.length > 0 && (
                        <Chip
                          label={`${expense.lineItems.length} items`}
                          color="primary"
                          size="small"
                          onClick={() => toggleExpanded(expense.id)}
                          sx={{ cursor: "pointer" }}
                        />
                      )}
                    </Box>

                    {/* Description — shows auto-generated from items if no manual description */}
                    {getDisplayDescription(expense) && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 1, fontStyle: "italic", fontSize: "0.78rem" }}
                      >
                        {getDisplayDescription(expense)}
                      </Typography>
                    )}

                    {/* Expandable line items */}
                    {expandedExpenseId === expense.id && expense.lineItems && expense.lineItems.length > 0 && (
                      <Box sx={{ mt: 1.5, bgcolor: "#f5f5f5", borderRadius: 1, p: 1.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 0.5 }}>
                          Line Items ({expense.lineItems.length}):
                        </Typography>
                        {expense.lineItems.map((item, idx) => (
                          <Box key={idx} sx={{ display: "flex", justifyContent: "space-between", py: 0.25 }}>
                            <Typography variant="caption" sx={{ flex: 1, pr: 1 }}>
                              {item.item || item.description || "Item"}
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                              ${parseFloat(item.price || 0).toFixed(2)}
                            </Typography>
                          </Box>
                        ))}
                        <Box sx={{ borderTop: "1px solid #ddd", mt: 0.5, pt: 0.5, display: "flex", justifyContent: "space-between" }}>
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>Total</Typography>
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>
                            ${expense.lineItems.reduce((s, i) => s + parseFloat(i.price || 0), 0).toFixed(2)}
                          </Typography>
                        </Box>
                      </Box>
                    )}

                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                      {expense.jobName}
                    </Typography>
                  </CardContent>
                  <CardActions>
                    {expense.receiptUrl && (
                      <IconButton
                        size="small"
                        onClick={() => window.open(expense.receiptUrl, "_blank")}
                      >
                        <VisibilityIcon />
                      </IconButton>
                    )}
                    <IconButton size="small" onClick={() => handleEdit(expense)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(expense.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </CardActions>
                </Card>
              ))
          )}
        </Box>
      ) : (
        // Desktop Table View
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Vendor</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Job</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>What Was Purchased</TableCell>
                <TableCell>Tax Ded.</TableCell>
                <TableCell>Receipt</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center">
                    No expenses found
                  </TableCell>
                </TableRow>
              ) : (
                filteredExpenses
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((expense) => (
                    <React.Fragment key={expense.id}>
                      <TableRow
                        sx={{
                          cursor: expense.lineItems?.length > 0 ? "pointer" : "default",
                          bgcolor: expandedExpenseId === expense.id ? "#f3f8ff" : "inherit",
                          "&:hover": { bgcolor: "#fafafa" },
                        }}
                        onClick={() => expense.lineItems?.length > 0 && toggleExpanded(expense.id)}
                      >
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {moment(expense.date).format("MMM DD, YYYY")}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{expense.vendor}</TableCell>
                        <TableCell>
                          <Chip label={expense.category} size="small" />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 140 }}>
                          <Typography variant="body2" noWrap title={expense.jobName}>
                            {expense.jobName || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          ${parseFloat(expense.amount).toFixed(2)}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 260 }}>
                          {/* Description line — auto-generated from items if blank */}
                          {getDisplayDescription(expense) ? (
                            <Box>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{ fontSize: "0.78rem", fontStyle: "italic" }}
                                noWrap
                                title={getDisplayDescription(expense)}
                              >
                                {getDisplayDescription(expense)}
                              </Typography>
                              {expense.lineItems?.length > 0 && (
                                <Typography variant="caption" color="primary" sx={{ cursor: "pointer" }}>
                                  {expandedExpenseId === expense.id ? "▲ hide" : `▼ ${expense.lineItems.length} items`}
                                </Typography>
                              )}
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.disabled">—</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {expense.taxDeductible ? (
                            <Chip label="Yes" color="success" size="small" />
                          ) : (
                            <Chip label="No" size="small" />
                          )}
                        </TableCell>
                        <TableCell>
                          {expense.receiptUrl && (
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); window.open(expense.receiptUrl, "_blank"); }}
                            >
                              <VisibilityIcon />
                            </IconButton>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleEdit(expense); }}>
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => { e.stopPropagation(); handleDelete(expense.id); }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>

                      {/* Expandable line items row */}
                      {expandedExpenseId === expense.id && expense.lineItems?.length > 0 && (
                        <TableRow sx={{ bgcolor: "#f3f8ff" }}>
                          <TableCell colSpan={9} sx={{ py: 0, px: 4 }}>
                            <Box sx={{ py: 1.5 }}>
                              <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 1, color: "primary.main" }}>
                                📋 {expense.vendor} — Full Item Breakdown ({expense.lineItems.length} items):
                              </Typography>
                              <Box sx={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                                gap: 0.5,
                              }}>
                                {expense.lineItems.map((item, idx) => (
                                  <Box key={idx} sx={{ display: "flex", justifyContent: "space-between", px: 1, py: 0.25, bgcolor: "white", borderRadius: 1 }}>
                                    <Typography variant="caption" sx={{ flex: 1, pr: 2 }}>
                                      {item.item || item.description || "Item"}
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                                      ${parseFloat(item.price || 0).toFixed(2)}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                              <Box sx={{ mt: 1, textAlign: "right" }}>
                                <Typography variant="caption" color="text.secondary">
                                  Items subtotal: ${expense.lineItems.reduce((s, i) => s + parseFloat(i.price || 0), 0).toFixed(2)}
                                  {" · "}
                                  Recorded total: ${parseFloat(expense.amount).toFixed(2)}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Scanning Dialog */}
      <Dialog open={scanDialogOpen} maxWidth="sm" fullWidth>
        <DialogContent sx={{ textAlign: "center", py: 4 }}>
          <CircularProgress size={60} sx={{ mb: 2 }} />
          <Typography variant="h6">Scanning Receipt...</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Google Cloud Vision is analyzing the receipt
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            This may take 5-10 seconds...
          </Typography>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Expense Dialog - continues with itemized receipt display... */}
      {/* (Same dialog code as before with itemized receipt view) */}
      
      <Dialog
        open={addExpenseOpen || editExpenseOpen}
        onClose={() => {
          setAddExpenseOpen(false);
          setEditExpenseOpen(false);
          setEditingExpense(null);
          setScannedData(null);
          setShowItemizedView(false);
          setDebugInfo(null);
        }}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          {editExpenseOpen ? "Edit Expense" : "Add Expense"}
          {scannedData && scannedData.scanSuccess && (
            <Chip
              label="✓ AI Scanned"
              color="success"
              size="small"
              sx={{ ml: 2 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {/* Success Alert */}
          {scannedData && scannedData.scanSuccess && (
            <Alert severity="success" sx={{ mb: 2 }} icon={<CheckCircleIcon />}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                📸 Receipt Scanned Successfully!
              </Typography>
              <Typography variant="body2">
                <strong>Vendor:</strong> {scannedData.vendor}<br/>
                <strong>Amount:</strong> ${scannedData.amount}<br/>
                <strong>Date:</strong> {moment(scannedData.date).format("MMM DD, YYYY")}<br/>
                <strong>Category:</strong> {scannedData.category}
                {scannedData.lineItems && scannedData.lineItems.length > 0 && (
                  <><br/><strong>Items Extracted:</strong> {scannedData.lineItems.length}</>
                )}
              </Typography>
            </Alert>
          )}

          {/* Error Alert */}
          {scannedData && scannedData.scanError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                âš ï¸ Scan Failed - Manual Entry Required
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                The receipt was uploaded but scanning encountered an error.
              </Typography>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                Error: {scannedData.scanError}
              </Typography>
              {scannedData.errorCode && (
                <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  Code: {scannedData.errorCode}
                </Typography>
              )}
            </Alert>
          )}

          {/* Itemized Receipt View */}
          {showItemizedView && expenseForm.lineItems && expenseForm.lineItems.length > 0 && (
            <Paper sx={{ p: 2, mb: 3, backgroundColor: '#f5f5f5' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  📋 Itemized Receipt
                </Typography>
                <Button 
                  size="small" 
                  onClick={() => setShowItemizedView(false)}
                >
                  Hide Details
                </Button>
              </Box>
              
              <Divider sx={{ mb: 2 }} />
              
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                {expenseForm.vendor}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                {moment(expenseForm.date).format("MMMM DD, YYYY")}
                {scannedData?.receiptNumber && ` â€¢ Receipt #${scannedData.receiptNumber}`}
              </Typography>

              <List dense sx={{ mb: 2 }}>
                {expenseForm.lineItems.map((item, idx) => (
                  <ListItem key={idx} sx={{ py: 0.5 }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2">
                            {item.quantity && item.quantity !== '1' && `${item.quantity}x `}{item.item}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            ${parseFloat(item.price).toFixed(2)}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>

              <Divider sx={{ mb: 1 }} />
              
              {scannedData?.subtotal > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Subtotal:</Typography>
                  <Typography variant="body2">
                    ${parseFloat(scannedData.subtotal).toFixed(2)}
                  </Typography>
                </Box>
              )}
              
              {scannedData?.tax > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Tax:</Typography>
                  <Typography variant="body2">
                    ${parseFloat(scannedData.tax).toFixed(2)}
                  </Typography>
                </Box>
              )}
              
              <Divider sx={{ mb: 1 }} />
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>TOTAL:</Typography>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                  ${parseFloat(expenseForm.amount).toFixed(2)}
                </Typography>
              </Box>
            </Paper>
          )}

          {/* Show itemized button if we have items but view is hidden */}
          {!showItemizedView && expenseForm.lineItems && expenseForm.lineItems.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">
                  {expenseForm.lineItems.length} line items extracted from receipt
                </Typography>
                <Button 
                  size="small" 
                  onClick={() => setShowItemizedView(true)}
                  variant="outlined"
                >
                  View Details
                </Button>
              </Box>
            </Alert>
          )}

          {/* Form Fields - Same as before... */}
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Vendor *"
                value={expenseForm.vendor}
                onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
                fullWidth
                placeholder="e.g., Home Depot, Lowe's"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label="Amount *"
                type="number"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                fullWidth
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                select
                label="Category"
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                fullWidth
              >
                <MenuItem value="materials">Materials</MenuItem>
                <MenuItem value="fuel">Fuel</MenuItem>
                <MenuItem value="equipment">Equipment</MenuItem>
                <MenuItem value="labor">Labor</MenuItem>
                <MenuItem value="insurance">Insurance</MenuItem>
                <MenuItem value="tools">Tools</MenuItem>
                <MenuItem value="software">Software</MenuItem>
                <MenuItem value="vehicle">Vehicle</MenuItem>
                <MenuItem value="permits">Permits</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                label="Date"
                type="date"
                value={expenseForm.date}
                onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid item xs={12}>
              <Autocomplete
                options={[{ id: '', clientName: 'General Business Expense' }, ...jobs]}
                getOptionLabel={(option) => option.clientName || ''}
                value={
                  expenseForm.jobId
                    ? jobs.find((j) => j.id === expenseForm.jobId) || null
                    : { id: '', clientName: 'General Business Expense' }
                }
                onChange={(e, selected) => {
                  setExpenseForm({
                    ...expenseForm,
                    jobId: selected?.id || '',
                    jobName: selected?.clientName || '',
                  });
                }}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField {...params} label="Link to Job (Optional)" fullWidth />
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Description"
                value={expenseForm.description}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, description: e.target.value })
                }
                fullWidth
                multiline
                rows={2}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                select
                label="Payment Method"
                value={expenseForm.paymentMethod}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })
                }
                fullWidth
              >
                <MenuItem value="credit_card">Credit Card</MenuItem>
                <MenuItem value="debit_card">Debit Card</MenuItem>
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="check">Check</MenuItem>
                <MenuItem value="zelle">Zelle</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={expenseForm.taxDeductible}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, taxDeductible: e.target.checked })
                    }
                  />
                }
                label="Tax Deductible"
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                label="Notes"
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>

            {!scannedData && (
              <Grid item xs={12}>
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<UploadFileIcon />}
                  fullWidth
                >
                  {expenseForm.receiptFileName || "Upload Receipt (Optional)"}
                  <input type="file" hidden accept="image/*,application/pdf" onChange={handleFileChange} />
                </Button>
              </Grid>
            )}

            {(scannedData || expenseForm.receiptUrl) && (
              <Grid item xs={12}>
                <Alert severity="success" icon={<ReceiptIcon />}>
                  Receipt attached
                  {expenseForm.receiptUrl && (
                    <Button
                      size="small"
                      onClick={() => window.open(expenseForm.receiptUrl, "_blank")}
                      sx={{ ml: 2 }}
                    >
                      View Receipt
                    </Button>
                  )}
                </Alert>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAddExpenseOpen(false);
              setEditExpenseOpen(false);
              setEditingExpense(null);
              setScannedData(null);
              setShowItemizedView(false);
              setDebugInfo(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={editExpenseOpen ? handleUpdateExpense : handleAddExpense}
            disabled={uploading}
          >
            {uploading ? "Saving..." : editExpenseOpen ? "Update Expense" : "Save Expense"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}