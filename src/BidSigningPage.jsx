import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { createFullJobPackage } from "./utils/createFullJobPackage";
import { getTokenFromUrl } from './utils/tokenUtils';
import {
  Container,
  Typography,
  Button,
  Box,
  Paper,
  Divider,
  Alert,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  CssBaseline,
  ThemeProvider,
  createTheme,
} from "@mui/material";
import SignatureCanvas from "react-signature-canvas";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import Swal from "sweetalert2";

// Create a simple theme for public pages
const publicTheme = createTheme({
  palette: {
    primary: {
      main: '#1565c0',
    },
    success: {
      main: '#2e7d32',
    },
  },
});

const COMPANY = {
  name: "Kings Canyon Landscaping LLC",
  owner: "Darren Bennett",
  title: "Owner",
  phone: "(928) 450-5733",
  email: "kingscanyon775@gmail.com",
  logoPath: "/logo-kcl.png",
};

// This is a PUBLIC page - customers access without logging in
function BidSigningPageContent() {
  const { bidId } = useParams();
  const [loading, setLoading] = useState(true);
  const [bid, setBid] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [alreadySigned, setAlreadySigned] = useState(false);
  
  const sigPadRef = useRef(null);

  useEffect(() => {
    loadBid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId]);

  const loadBid = async () => {
    try {
      // Get token from URL
      const token = getTokenFromUrl();
      
      const docRef = doc(db, "bids", bidId);
      const snap = await getDoc(docRef);
      
      if (!snap.exists()) {
        Swal.fire("Not Found", "This bid link is invalid or expired.", "error");
        setLoading(false);
        return;
      }

      const data = snap.data();
      
      // Verify token matches (Firestore rules will also check this)
      if (data.signingToken && data.signingToken !== token) {
        Swal.fire("Access Denied", "Invalid or expired link. Please request a new signing link.", "error");
        setLoading(false);
        return;
      }
      
      setBid(data);
      
      // Check if already signed by client
      if (data.clientSignature && data.clientSignedAt) {
        setAlreadySigned(true);
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error loading bid:", error);
      Swal.fire("Error", "Failed to load bid. Please try again.", "error");
      setLoading(false);
    }
  };

  const handleClearSignature = () => {
    sigPadRef.current?.clear();
  };

  const handleSign = async () => {
    if (!agreed) {
      Swal.fire("Agreement Required", "Please check the box to accept this bid.", "warning");
      return;
    }

    if (sigPadRef.current?.isEmpty()) {
      Swal.fire("Signature Required", "Please sign in the box above.", "warning");
      return;
    }

    setSigning(true);

    try {
      const signatureData = sigPadRef.current.toDataURL();
      const timestamp = new Date().toISOString();
      
      // Auto-generate Darren's signature
      const darrenSig = generateDarrenSignature();

      await updateDoc(doc(db, "bids", bidId), {
        clientSignature: signatureData,
        clientSignedAt: timestamp,
        contractorSignature: darrenSig,
        contractorSignedAt: timestamp,
        status: "Accepted", // Bid is now accepted
        lastUpdated: timestamp,
      });

      console.log("Bid accepted by client:", bidId);

      // Phase 3: Notify admins via text
      try {
        const functions = getFunctions();
        const notifySignature = httpsCallable(functions, 'notifySignature');
        await notifySignature({
          docType: 'bid',
          docId: bidId,
          customerName: bid.customerName,
          amount: bid.amount,
        });
        console.log("Admin notification sent for bid signing");
      } catch (notifyError) {
        console.error("Admin notification failed (non-blocking):", notifyError);
      }

	        // Phase 2C Fix 3: Auto-create contract + invoice + job package
      try {
        const bidData = { ...bid, id: bidId };
         await createFullJobPackage(bidData, true);
        console.log("Job package auto-created for bid:", bidId);
      } catch (pkgError) {
        console.error("Auto-create package failed (will need manual creation):", pkgError);
        // Don't block the signing success - package can be created manually from Bids list
      }

      Swal.fire({
        icon: "success",
        title: "Bid Accepted!",
        html: `
          <p>Thank you for accepting our bid!</p>
          <p><strong>Next Steps:</strong></p>
          <ul style="text-align: left;">
            <li>We'll contact you to schedule the work</li>
            <li>A deposit of 50% will be required to begin</li>
            <li>Estimated amount: <strong>$${(bid.amount || 0).toFixed(2)}</strong></li>
          </ul>
          <p>Questions? Call us at ${COMPANY.phone}</p>
        `,
        confirmButtonText: "Close",
      });

      setAlreadySigned(true);
    } catch (error) {
      console.error("Error saving signature:", error);
      Swal.fire("Error", "Failed to save signature. Please try again.", "error");
    } finally {
      setSigning(false);
    }
  };

  // Generate Darren's auto-signature
  const generateDarrenSignature = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 400, 100);
    
    // Signature text in cursive style
    ctx.font = '32px "Brush Script MT", cursive';
    ctx.fillStyle = 'black';
    ctx.fillText('Darren Bennett', 50, 60);
    
    return canvas.toDataURL('image/png');
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, textAlign: "center" }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading bid...
        </Typography>
      </Container>
    );
  }

  if (!bid) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">
          <Typography variant="h6">Bid Not Found</Typography>
          <Typography>This bid link is invalid or has expired.</Typography>
        </Alert>
      </Container>
    );
  }

  if (alreadySigned) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <CheckCircleIcon sx={{ fontSize: 80, color: "success.main", mb: 2 }} />
          <Typography variant="h4" gutterBottom>
            Bid Already Accepted!
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            You accepted this bid on {bid.clientSignedAt ? new Date(bid.clientSignedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'a previous date'}
          </Typography>
          <Divider sx={{ my: 3 }} />
          <Typography variant="h6" gutterBottom>
            Next Steps:
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            • We'll contact you to schedule the work<br />
            • A deposit of 50% will be required to begin<br />
            • Estimated amount: <strong>${(bid.amount || 0).toFixed(2)}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Questions? Call us at {COMPANY.phone}
          </Typography>
        </Paper>
      </Container>
    );
  }

  const depositAmount = (bid.amount || 0) * 0.5;
  const finalAmount = (bid.amount || 0) - depositAmount;

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Paper sx={{ p: { xs: 2, sm: 4 } }}>
        {/* Header */}
        <Box sx={{ textAlign: "center", mb: 4 }}>
          <img 
            src={COMPANY.logoPath} 
            alt="Kings Canyon Landscaping" 
            style={{ height: 80, marginBottom: 16 }}
            onError={(e) => { e.target.style.display = 'none' }}
          />
          <Typography variant="h4" gutterBottom>
            Bid Proposal
          </Typography>
          <Typography variant="h5" color="primary">
            {COMPANY.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {COMPANY.phone} • {COMPANY.email}
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Bid Details */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Bid Details
          </Typography>
          <Box sx={{ pl: 2 }}>
            <Typography variant="body1" sx={{ mb: 1 }}>
              <strong>Client:</strong> {bid.customerName}
            </Typography>
            <Typography variant="body1" sx={{ mb: 1 }}>
              <strong>Estimated Amount:</strong> ${(bid.amount || 0).toFixed(2)}
            </Typography>
            <Typography variant="body1" sx={{ mb: 1 }}>
              <strong>Required Deposit (50%):</strong> ${depositAmount.toFixed(2)}
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              <strong>Date:</strong> {new Date().toLocaleDateString()}
            </Typography>
            
            {bid.description && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  <strong>Scope of Work:</strong>
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", pl: 2 }}>
                  {bid.description}
                </Typography>
              </Box>
            )}

            {bid.materials && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  <strong>Materials:</strong>
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", pl: 2 }}>
                  {bid.materials}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Terms & Conditions */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Terms & Conditions
          </Typography>
          <Box sx={{ pl: 2 }}>
            <Typography variant="body2" paragraph>
              <strong>Bid Validity:</strong> This bid is valid for 30 days from the date listed above.
            </Typography>
            <Typography variant="body2" paragraph>
              <strong>Payment Terms:</strong> A deposit of 50% is required to begin work. The remaining balance is due upon completion. Payment is accepted via Zelle, cash, or check.
            </Typography>
            <Typography variant="body2" paragraph>
              <strong>Pricing:</strong> Final pricing may vary based on site conditions and material availability. Any changes will be communicated before proceeding.
            </Typography>
            <Typography variant="body2" paragraph>
              <strong>Warranty:</strong> All workmanship is warranted for 30 days from completion against defects in installation.
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Signature Section */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Accept This Bid
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            By signing below, you accept this bid and agree to the terms and conditions.
          </Alert>
          
          <Paper 
            variant="outlined" 
            sx={{ 
              p: 2, 
              mb: 2,
              border: "2px solid",
              borderColor: "primary.main",
            }}
          >
            <Typography variant="subtitle2" gutterBottom>
              Sign with your finger or mouse:
            </Typography>
            <Box sx={{ 
              border: "1px solid #ccc", 
              borderRadius: 1,
              backgroundColor: "white",
              touchAction: "none",
            }}>
              <SignatureCanvas
                ref={sigPadRef}
                canvasProps={{
                  width: 500,
                  height: 200,
                  style: { 
                    width: "100%", 
                    height: "auto",
                    touchAction: "none",
                  },
                }}
              />
            </Box>
            <Button 
              size="small" 
              onClick={handleClearSignature}
              sx={{ mt: 1 }}
            >
              Clear Signature
            </Button>
          </Paper>

          <FormControlLabel
            control={
              <Checkbox 
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                color="primary"
              />
            }
            label={
              <Typography variant="body2">
                I accept this bid and agree to the terms and conditions
              </Typography>
            }
          />
        </Box>

        {/* Accept Button */}
        <Box sx={{ textAlign: "center" }}>
          <Button
            variant="contained"
            size="large"
            onClick={handleSign}
            disabled={signing || !agreed}
            sx={{ 
              minWidth: 200,
              py: 1.5,
              fontSize: "1.1rem",
            }}
          >
            {signing ? "Accepting..." : "Accept Bid"}
          </Button>
          <Typography variant="caption" display="block" sx={{ mt: 2, color: "text.secondary" }}>
            Your signature will be securely stored and we'll contact you to schedule work
          </Typography>
        </Box>
      </Paper>

      {/* Footer */}
      <Box sx={{ textAlign: "center", mt: 4 }}>
        <Typography variant="body2" color="text.secondary">
          {COMPANY.name} | {COMPANY.phone} | {COMPANY.email}
        </Typography>
      </Box>
    </Container>
  );
}

// Wrapper component that prevents navigation to main app
export default function BidSigningPage() {
  return (
    <ThemeProvider theme={publicTheme}>
      <CssBaseline />
      <BidSigningPageContent />
    </ThemeProvider>
  );
}