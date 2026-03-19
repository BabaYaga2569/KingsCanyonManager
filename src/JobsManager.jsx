import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Card,
  CardContent,
  CardActions,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Checkbox,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Badge,
  InputAdornment,
} from "@mui/material";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import CloseIcon from "@mui/icons-material/Close";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import EditIcon from "@mui/icons-material/Edit";
import SortIcon from "@mui/icons-material/Sort";
import FilterListIcon from "@mui/icons-material/FilterList";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PersonIcon from "@mui/icons-material/Person";
import DownloadIcon from "@mui/icons-material/Download";
import SearchIcon from "@mui/icons-material/Search";
import { exportJobsToExcel, exportJobsToCSV } from "./utils/kclExportUtils";
import Swal from "sweetalert2";
import { markAsViewed } from "./useNotificationCounts";

export default function JobsManager() {
  const [jobs, setJobs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [sortedJobs, setSortedJobs] = useState([]);
  const [sortOrder, setSortOrder] = useState("newest");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedClients, setExpandedClients] = useState({});
  const [cameraOpen, setCameraOpen] = useState(false);
  const [currentJob, setCurrentJob] = useState(null);
  const [photoType, setPhotoType] = useState("");
  const [capturedImage, setCapturedImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [editForm, setEditForm] = useState({
    clientName: "",
    description: "",
    amount: "",
    status: "",
    startDate: "",
    completionDate: "",
    notes: "",
    assignedEmployees: [],
  });

  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    markAsViewed("jobs");
  }, []);

  useEffect(() => {
    let filtered = [...jobs];

    if (jobTypeFilter !== "all") {
      filtered = filtered.filter((job) => job.jobType === jobTypeFilter);
    }

    const search = searchTerm.trim().toLowerCase();

    if (search) {
      filtered = filtered.filter((job) => {
        const searchableText = [
          job.clientName,
          job.description,
          job.notes,
          job.jobType,
          job.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(search);
      });
    }

    const sorted = filtered.sort((a, b) => {
      switch (sortOrder) {
        case "newest": {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || a.startDate || 0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || b.startDate || 0);
          return dateB - dateA;
        }
        case "oldest": {
          const dateA2 = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || a.startDate || 0);
          const dateB2 = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || b.startDate || 0);
          return dateA2 - dateB2;
        }
        case "name-asc":
          return (a.clientName || "").localeCompare(b.clientName || "");
        case "name-desc":
          return (b.clientName || "").localeCompare(a.clientName || "");
        case "status-active":
          if (a.status === "Active" && b.status !== "Active") return -1;
          if (a.status !== "Active" && b.status === "Active") return 1;
          return 0;
        case "status-completed":
          if (a.status === "Completed" && b.status !== "Completed") return -1;
          if (a.status !== "Completed" && b.status === "Completed") return 1;
          return 0;
        case "status-pending":
          if (a.status === "Pending" && b.status !== "Pending") return -1;
          if (a.status !== "Pending" && b.status === "Pending") return 1;
          return 0;
        default:
          return 0;
      }
    });

    setSortedJobs(sorted);
  }, [jobs, sortOrder, jobTypeFilter, searchTerm]);

  const fetchJobs = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "jobs"));
      const jobList = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setJobs(jobList);

      const usersSnap = await getDocs(collection(db, "users"));
      const activeEmployees = usersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((user) => user.active !== false);
      setEmployees(activeEmployees);
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (jobId, newStatus) => {
    try {
      await updateDoc(doc(db, "jobs", jobId), { status: newStatus });
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId ? { ...job, status: newStatus } : job
        )
      );
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const handleJobTypeChange = async (jobId, newJobType) => {
    try {
      await updateDoc(doc(db, "jobs", jobId), { jobType: newJobType });
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId ? { ...job, jobType: newJobType } : job
        )
      );

      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Job type updated!",
        showConfirmButton: false,
        timer: 2000,
      });
    } catch (error) {
      console.error("Error updating job type:", error);
      Swal.fire("Error", "Failed to update job type.", "error");
    }
  };

  const handleDeleteJob = async (jobId, clientName) => {
    const confirm = await Swal.fire({
      title: `Delete ${clientName}'s job?`,
      text: "This will permanently remove this job and all its photos.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it",
      cancelButtonText: "Cancel",
    });

    if (!confirm.isConfirmed) return;

    try {
      await deleteDoc(doc(db, "jobs", jobId));
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      Swal.fire("Deleted!", "Job has been removed.", "success");
    } catch (error) {
      console.error("Error deleting job:", error);
      Swal.fire("Error", "Failed to delete job.", "error");
    }
  };

  const handleViewPhotos = (job) => {
    setCurrentJob(job);
    const beforePhotos = job.beforePhotos || [];
    const afterPhotos = job.afterPhotos || [];

    if (beforePhotos.length === 0 && afterPhotos.length === 0) {
      Swal.fire("No Photos", "This job has no photos yet.", "info");
      return;
    }

    const photoHTML = `
      <div style="max-height: 500px; overflow-y: auto; padding: 10px;">
        ${beforePhotos.length > 0 ? '<h3 style="color: #1976d2;">Before Photos:</h3>' : ""}
        ${beforePhotos.map((url, i) => `
          <div style="margin: 15px 0;">
            <p style="font-weight: bold;">Before Photo ${i + 1} 
              <button 
                onclick="window.deletePhoto('${url}', 'before')"
                style="background: #f44336; color: white; border: none; border-radius: 4px; padding: 4px 12px; margin-left: 10px; cursor: pointer; font-size: 12px;"
              >Delete</button>
            </p>
            <img src="${url}" 
                 style="width: 100%; max-width: 400px; border-radius: 8px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
                 onclick="window.open('${url}', '_blank')" />
          </div>
        `).join("")}
        
        ${afterPhotos.length > 0 ? '<h3 style="color: #2e7d32; margin-top: 20px;">After Photos:</h3>' : ""}
        ${afterPhotos.map((url, i) => `
          <div style="margin: 15px 0;">
            <p style="font-weight: bold;">After Photo ${i + 1}
              <button 
                onclick="window.deletePhoto('${url}', 'after')"
                style="background: #f44336; color: white; border: none; border-radius: 4px; padding: 4px 12px; margin-left: 10px; cursor: pointer; font-size: 12px;"
              >Delete</button>
            </p>
            <img src="${url}" 
                 style="width: 100%; max-width: 400px; border-radius: 8px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
                 onclick="window.open('${url}', '_blank')" />
          </div>
        `).join("")}
      </div>
      <p style="margin-top: 20px; font-size: 14px; color: #666; text-align: center;">
        Tap photo to view full size | Red button to delete
      </p>
    `;

    window.deletePhoto = async (photoUrl, photoType) => {
      Swal.close();
      await handleDeletePhoto(photoUrl, photoType);
      setTimeout(() => {
        const updatedJob = jobs.find((j) => j.id === job.id);
        if (updatedJob) handleViewPhotos(updatedJob);
      }, 500);
    };

    Swal.fire({
      title: `${job.clientName} - Photos`,
      html: photoHTML,
      width: "90%",
      showCloseButton: true,
      showConfirmButton: false,
    });
  };

  const handleOpenEditDialog = (job) => {
    setEditingJob(job);
    setEditForm({
      clientName: job.clientName || "",
      description: job.description || "",
      amount: job.amount || "",
      status: job.status || "",
      startDate: job.startDate || "",
      completionDate: job.completionDate || "",
      notes: job.notes || "",
      assignedEmployees: job.assignedEmployees || [],
    });
    setEditDialogOpen(true);
  };

  const handleCloseEditDialog = () => {
    setEditDialogOpen(false);
    setEditingJob(null);
    setEditForm({
      clientName: "",
      description: "",
      amount: "",
      status: "",
      startDate: "",
      completionDate: "",
      notes: "",
      assignedEmployees: [],
    });
  };

  const handleSaveEdit = async () => {
    if (!editingJob) return;

    try {
      await updateDoc(doc(db, "jobs", editingJob.id), editForm);
      setJobs((prev) =>
        prev.map((job) =>
          job.id === editingJob.id ? { ...job, ...editForm } : job
        )
      );
      Swal.fire("Updated!", "Job details have been saved.", "success");
      handleCloseEditDialog();
    } catch (error) {
      console.error("Error updating job:", error);
      Swal.fire("Error", "Failed to update job.", "error");
    }
  };

  const handleOpenCamera = async (type, job) => {
    setCurrentJob(job);
    setPhotoType(type);
    setCapturedImage(null);
    setCameraOpen(true);
  };

  const handleCloseCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
    setCurrentJob(null);
    setPhotoType("");
    setCapturedImage(null);
  };

  const startCamera = async () => {
    try {
      console.log("🎥 Starting camera...");

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera not supported on this device");
      }

      const constraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      console.log("📱 Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("✅ Camera stream obtained");

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("autoplay", "true");
        videoRef.current.muted = true;

        try {
          await videoRef.current.play();
          console.log("✅ Video playing");
        } catch (playError) {
          console.log("⚠️ Auto-play failed, trying manual play");
          videoRef.current.play().catch((e) => console.error("Play error:", e));
        }
      }
    } catch (error) {
      console.error("❌ Camera error:", error.name, error.message);

      try {
        console.log("🔄 Trying fallback camera...");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.setAttribute("autoplay", "true");
          videoRef.current.muted = true;
          await videoRef.current.play();
          console.log("✅ Fallback camera working");
        }
      } catch (fallbackError) {
        console.error("❌ Fallback camera error:", fallbackError);

        let errorMessage = "Could not access camera. ";
        if (fallbackError.name === "NotAllowedError" || fallbackError.name === "PermissionDeniedError") {
          errorMessage += "Please allow camera permissions in your browser settings.";
        } else if (fallbackError.name === "NotFoundError") {
          errorMessage += "No camera found on this device.";
        } else {
          errorMessage += "Please check your device settings.";
        }

        Swal.fire("Camera Error", errorMessage, "error");
        handleCloseCamera();
      }
    }
  };

  useEffect(() => {
    if (cameraOpen && videoRef.current) {
      startCamera();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraOpen]);

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setCapturedImage(dataUrl);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadPhoto = async () => {
    if (!capturedImage || !currentJob) return;

    setUploading(true);
    try {
      const blob = await (await fetch(capturedImage)).blob();
      const fileName = `${currentJob.id}_${photoType}_${Date.now()}.jpg`;
      const storageRef = ref(storage, `job-photos/${fileName}`);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);

      const field = photoType === "before" ? "beforePhotos" : "afterPhotos";
      const currentPhotos = currentJob[field] || [];
      const updatedPhotos = [...currentPhotos, url];

      await updateDoc(doc(db, "jobs", currentJob.id), {
        [field]: updatedPhotos,
      });

      setJobs((prev) =>
        prev.map((job) =>
          job.id === currentJob.id
            ? { ...job, [field]: updatedPhotos }
            : job
        )
      );

      Swal.fire("Success!", "Photo uploaded.", "success");
      handleCloseCamera();
    } catch (error) {
      console.error("Upload error:", error);

      let errorDetails = `Error: ${error.message || "Unknown error"}\n\n`;

      if (error.code) {
        errorDetails += `Code: ${error.code}\n\n`;
      }

      if (error.code === "storage/unauthorized") {
        errorDetails += "This means Firebase Storage permissions are blocking the upload.\n\nFix: Go to Firebase Console → Storage → Rules";
      } else if (error.code === "storage/canceled") {
        errorDetails += "Upload was cancelled.";
      } else if (error.name) {
        errorDetails += `Type: ${error.name}`;
      }

      Swal.fire({
        title: "Upload Failed",
        text: errorDetails,
        icon: "error",
        confirmButtonText: "OK",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photoUrl, photoType) => {
    const result = await Swal.fire({
      title: "Delete Photo?",
      text: "This cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    try {
      const field = photoType === "before" ? "beforePhotos" : "afterPhotos";
      const currentPhotos = currentJob[field] || [];
      const updatedPhotos = currentPhotos.filter((url) => url !== photoUrl);

      await updateDoc(doc(db, "jobs", currentJob.id), {
        [field]: updatedPhotos,
      });

      setJobs((prev) =>
        prev.map((job) =>
          job.id === currentJob.id
            ? { ...job, [field]: updatedPhotos }
            : job
        )
      );

      Swal.fire("Deleted!", "Photo has been deleted.", "success");
    } catch (error) {
      console.error("Delete error:", error);
      Swal.fire("Error", "Failed to delete photo.", "error");
    }
  };

  const getStatusColor = (status) => {
    switch ((status || "").toLowerCase()) {
      case "active":
        return "success";
      case "pending":
        return "warning";
      case "completed":
        return "info";
      default:
        return "default";
    }
  };

  if (loading) {
    return (
      <Typography sx={{ mt: 4, textAlign: "center" }}>
        Loading jobs...
      </Typography>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h6" sx={{ fontSize: { xs: "1.5rem", sm: "2rem" } }}>
          Jobs ({sortedJobs.length})
        </Typography>

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder="Search client, description, type, status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ minWidth: { xs: "100%", sm: 300 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="filter-label">
              <FilterListIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: "middle" }} />
              Filter by Type
            </InputLabel>
            <Select
              labelId="filter-label"
              value={jobTypeFilter}
              label="Filter by Type"
              onChange={(e) => setJobTypeFilter(e.target.value)}
            >
              <MenuItem value="all">All Jobs</MenuItem>
              <MenuItem value="Quick Weed Service">Quick Weed Service</MenuItem>
              <MenuItem value="Maintenance">Maintenance</MenuItem>
              <MenuItem value="General Service">General Service</MenuItem>
            </Select>
          </FormControl>

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
              <MenuItem value="status-active">Active First</MenuItem>
              <MenuItem value="status-completed">Completed First</MenuItem>
              <MenuItem value="status-pending">Pending First</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={() => exportJobsToExcel(sortedJobs)}
          >
            Excel
          </Button>

          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={() => exportJobsToCSV(sortedJobs)}
          >
            CSV
          </Button>
        </Box>
      </Box>

      {sortedJobs.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="h6" color="text.secondary">No Jobs Found</Typography>
          <Typography variant="body2" color="text.secondary">
            {searchTerm
              ? "No jobs match your search."
              : jobTypeFilter !== "all"
                ? `No ${jobTypeFilter} jobs found. Try changing the filter.`
                : "Jobs will appear here after you create them"}
          </Typography>
        </Box>
      ) : (() => {
        const groups = sortedJobs.reduce((acc, job) => {
          const key = job.clientName || "Unknown Client";
          if (!acc[key]) acc[key] = [];
          acc[key].push(job);
          return acc;
        }, {});

        return Object.entries(groups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([clientName, clientJobs]) => {
            const isExpanded = expandedClients[clientName] !== false;
            const hasMultiple = clientJobs.length > 1;
            const activeCount = clientJobs.filter((j) => j.status === "Active").length;
            const pendingCount = clientJobs.filter((j) => j.status === "Pending").length;

            return (
              <Accordion
                key={clientName}
                expanded={isExpanded}
                onChange={() => setExpandedClients((prev) => ({ ...prev, [clientName]: !isExpanded }))}
                sx={{ mb: 1.5, boxShadow: 2, borderRadius: "8px !important", "&:before": { display: "none" } }}
              >
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  sx={{ backgroundColor: "#f5f5f5", borderRadius: "8px", minHeight: 56 }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%", pr: 1 }}>
                    <PersonIcon color="primary" />
                    <Typography variant="h6" sx={{ fontSize: "1rem", fontWeight: 700, flex: 1 }}>
                      {clientName}
                    </Typography>
                    <Badge badgeContent={clientJobs.length} color="primary" sx={{ mr: 1 }}>
                      <Chip label={`${clientJobs.length} job${clientJobs.length > 1 ? "s" : ""}`} size="small" />
                    </Badge>
                    {activeCount > 0 && <Chip label={`${activeCount} Active`} size="small" color="success" />}
                    {pendingCount > 0 && <Chip label={`${pendingCount} Pending`} size="small" color="warning" />}
                  </Box>
                </AccordionSummary>

                <AccordionDetails sx={{ p: 2 }}>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(300px, 1fr))" },
                      gap: 2,
                    }}
                  >
                    {clientJobs.map((job, jobIndex) => {
                      const jobLabel = hasMultiple
                        ? `Job #${jobIndex + 1} — ${(() => {
                            const raw = job.serviceDate || job.startDate || job.createdAt;
                            if (!raw) return "No date";
                            try {
                              const d = raw?.toDate ? raw.toDate() : new Date(raw);
                              return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                            } catch {
                              return "No date";
                            }
                          })()}`
                        : null;

                      return (
                        <Card key={job.id} sx={{ boxShadow: 1, border: hasMultiple ? "1px solid #e0e0e0" : "none" }}>
                          <CardContent>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 1.5 }}>
                              <Box>
                                {jobLabel && (
                                  <Typography variant="caption" color="primary" fontWeight="bold" display="block">
                                    {jobLabel}
                                  </Typography>
                                )}
                                <Typography variant="body1" fontWeight="bold">
                                  {job.jobType || "General Service"}
                                </Typography>
                              </Box>
                              <Chip label={job.status || "Pending"} color={getStatusColor(job.status)} size="small" />
                            </Box>

                            {(job.description || job.notes) ? (
                              <Box sx={{ mb: 2, p: 1.5, bgcolor: "#f0f4ff", borderRadius: 1, borderLeft: "3px solid #1976d2" }}>
                                <Typography variant="caption" color="primary" fontWeight="bold" display="block" gutterBottom>
                                  Job Description
                                </Typography>
                                <Typography
                                  variant="body2"
                                  color="text.primary"
                                  sx={{
                                    display: "-webkit-box",
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {job.description || job.notes}
                                </Typography>
                                {(job.description || job.notes || "").length > 150 && (
                                  <Typography variant="caption" color="text.secondary">
                                    (tap Edit Job to see full description)
                                  </Typography>
                                )}
                              </Box>
                            ) : (
                              <Box sx={{ mb: 2, p: 1, bgcolor: "#fff8e1", borderRadius: 1, borderLeft: "3px solid #ff9800" }}>
                                <Typography variant="caption" color="warning.dark">
                                  ⚠️ No description — add one via Edit Job
                                </Typography>
                              </Box>
                            )}

                            {(() => {
                              const revenue = parseFloat(job.amount || 0);
                              const materials = parseFloat(job.totalExpenses || 0);
                              const hasRevenue = revenue > 0;
                              if (!hasRevenue) {
                                return (
                                  <Box sx={{ mb: 2, p: 1, bgcolor: "#f5f5f5", borderRadius: 1, display: "flex", alignItems: "center", gap: 1 }}>
                                    <Typography variant="caption" color="text.secondary">
                                      💰 No invoice — profitability unknown
                                    </Typography>
                                  </Box>
                                );
                              }
                              const profit = revenue - materials;
                              const margin = (profit / revenue) * 100;
                              const isLoss = margin < 0;
                              const isThin = margin >= 0 && margin < 20;
                              const bgcolor = isLoss ? "#ffebee" : isThin ? "#fffde7" : "#e8f5e9";
                              const borderColor = isLoss ? "#f44336" : isThin ? "#ff9800" : "#4caf50";
                              const emoji = isLoss ? "🔴" : isThin ? "🟡" : "🟢";
                              return (
                                <Box sx={{ mb: 2, p: 1, bgcolor, borderRadius: 1, borderLeft: `3px solid ${borderColor}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <Typography variant="caption" fontWeight="bold">
                                    {emoji} Margin: {margin.toFixed(0)}%
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    ${revenue.toFixed(0)} rev · ${materials.toFixed(0)} mat
                                  </Typography>
                                </Box>
                              );
                            })()}

                            <FormControl fullWidth sx={{ mb: 2 }}>
                              <InputLabel size="small">Job Type</InputLabel>
                              <Select
                                size="small"
                                value={job.jobType || "General Service"}
                                label="Job Type"
                                onChange={(e) => handleJobTypeChange(job.id, e.target.value)}
                              >
                                <MenuItem value="Quick Weed Service">Quick Weed Service</MenuItem>
                                <MenuItem value="Maintenance">Maintenance</MenuItem>
                                <MenuItem value="General Service">General Service</MenuItem>
                              </Select>
                            </FormControl>

                            <FormControl fullWidth sx={{ mb: 2 }}>
                              <InputLabel size="small">Change Status</InputLabel>
                              <Select
                                size="small"
                                value={job.status || "Pending"}
                                label="Change Status"
                                onChange={(e) => handleStatusChange(job.id, e.target.value)}
                              >
                                <MenuItem value="Active">Active</MenuItem>
                                <MenuItem value="Pending">Pending</MenuItem>
                                <MenuItem value="Completed">Completed</MenuItem>
                                <MenuItem value="Cancelled">Cancelled</MenuItem>
                              </Select>
                            </FormControl>

                            <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
                              <Chip icon={<PhotoLibraryIcon />} label={`Before: ${(job.beforePhotos || []).length}`} size="small" color="primary" variant="outlined" />
                              <Chip icon={<PhotoLibraryIcon />} label={`After: ${(job.afterPhotos || []).length}`} size="small" color="success" variant="outlined" />
                            </Box>
                          </CardContent>

                          <CardActions sx={{ p: 2, pt: 0, flexDirection: "column", gap: 1 }}>
                            <Button variant="contained" color="primary" startIcon={<EditIcon />} onClick={() => handleOpenEditDialog(job)} fullWidth size="small">
                              Edit Job
                            </Button>
                            <Button variant="outlined" startIcon={<CameraAltIcon />} onClick={() => handleOpenCamera("before", job)} fullWidth size="small">
                              Take Before Photo
                            </Button>
                            <Button variant="outlined" color="success" startIcon={<CameraAltIcon />} onClick={() => handleOpenCamera("after", job)} fullWidth size="small">
                              Take After Photo
                            </Button>
                            <Button variant="contained" color="info" onClick={() => handleViewPhotos(job)} fullWidth size="small">
                              View All Photos ({(job.beforePhotos || []).length + (job.afterPhotos || []).length})
                            </Button>
                            <Button variant="contained" color="primary" onClick={() => navigate(`/job-expenses/${job.id}`)} fullWidth size="small">
                              View Expenses & Profit
                            </Button>
                            <Button variant="outlined" color="error" onClick={() => handleDeleteJob(job.id, job.clientName)} fullWidth size="small">
                              Delete Job
                            </Button>
                          </CardActions>
                        </Card>
                      );
                    })}
                  </Box>
                </AccordionDetails>
              </Accordion>
            );
          });
      })()}

      <Dialog
        open={cameraOpen}
        onClose={handleCloseCamera}
        maxWidth="sm"
        fullWidth
        fullScreen={window.innerWidth < 600}
      >
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6">
            {photoType.charAt(0).toUpperCase() + photoType.slice(1)} Photo
          </Typography>
          <IconButton onClick={handleCloseCamera}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          {!capturedImage ? (
            <Box sx={{ textAlign: "center" }}>
              <Box sx={{ display: { xs: "none", sm: "block" } }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    maxHeight: "400px",
                    borderRadius: "8px",
                    backgroundColor: "#000",
                  }}
                />
                <canvas ref={canvasRef} style={{ display: "none" }} />
              </Box>

              <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleCapturePhoto}
                  fullWidth
                  size="large"
                  sx={{ display: { xs: "none", sm: "flex" } }}
                >
                  Capture Photo
                </Button>

                <Button
                  variant="contained"
                  onClick={() => fileInputRef.current?.click()}
                  fullWidth
                  size="large"
                  sx={{ display: { xs: "flex", sm: "none" } }}
                >
                  Open Camera
                </Button>

                <Button
                  variant="outlined"
                  onClick={() => galleryInputRef.current?.click()}
                  fullWidth
                >
                  Choose from Gallery
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </Box>
            </Box>
          ) : (
            <Box sx={{ textAlign: "center" }}>
              <img
                src={capturedImage}
                alt="Captured"
                style={{
                  width: "100%",
                  maxHeight: "400px",
                  borderRadius: "8px",
                  objectFit: "contain",
                }}
              />
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          {capturedImage ? (
            <>
              <Button
                onClick={() => setCapturedImage(null)}
                variant="outlined"
              >
                Retake
              </Button>
              <Button
                onClick={handleUploadPhoto}
                disabled={uploading}
                variant="contained"
                color="success"
              >
                {uploading ? "Uploading..." : "Save Photo"}
              </Button>
            </>
          ) : (
            <Button onClick={handleCloseCamera}>
              Cancel
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onClose={handleCloseEditDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Job</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            <TextField
              label="Client Name *"
              value={editForm.clientName}
              onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })}
              fullWidth
            />

            <TextField
              label="Description"
              multiline
              rows={3}
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              fullWidth
            />

            <TextField
              label="Amount ($)"
              type="number"
              value={editForm.amount}
              onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
              fullWidth
              inputProps={{ min: 0, step: "0.01" }}
            />

            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={editForm.status}
                label="Status"
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              >
                <MenuItem value="Active">Active</MenuItem>
                <MenuItem value="Pending">Pending</MenuItem>
                <MenuItem value="Completed">Completed</MenuItem>
                <MenuItem value="Cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Start Date"
              type="date"
              value={editForm.startDate}
              onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Completion Date"
              type="date"
              value={editForm.completionDate}
              onChange={(e) => setEditForm({ ...editForm, completionDate: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Notes"
              multiline
              rows={3}
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              fullWidth
            />

            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Assigned Employees</InputLabel>
              <Select
                multiple
                value={editForm.assignedEmployees || []}
                onChange={(e) => setEditForm({ ...editForm, assignedEmployees: e.target.value })}
                label="Assigned Employees"
                renderValue={(selected) => (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {selected.map((empId) => {
                      const emp = employees.find((e) => e.id === empId);
                      return (
                        <Chip
                          key={empId}
                          label={emp?.name || emp?.email || empId}
                          size="small"
                        />
                      );
                    })}
                  </Box>
                )}
              >
                {employees.map((emp) => (
                  <MenuItem key={emp.id} value={emp.id}>
                    <Checkbox checked={(editForm.assignedEmployees || []).indexOf(emp.id) > -1} />
                    <ListItemText primary={emp.name || emp.email} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseEditDialog}>Cancel</Button>
          <Button onClick={handleSaveEdit} variant="contained" color="primary">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}