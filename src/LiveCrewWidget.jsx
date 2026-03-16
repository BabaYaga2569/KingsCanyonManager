import React, { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  Divider,
} from "@mui/material";
import GpsFixedIcon from "@mui/icons-material/GpsFixed";
import RefreshIcon from "@mui/icons-material/Refresh";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import moment from "moment";

export default function LiveCrewWidget() {
  const [activeCrew, setActiveCrew] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadActiveCrew = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "job_time_entries"),
        where("clockOut", "==", null)
      );
      const snap = await getDocs(q);
      const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort by clock-in time, most recent first
      entries.sort((a, b) => new Date(b.clockIn) - new Date(a.clockIn));
      setActiveCrew(entries);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("LiveCrewWidget error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveCrew();
    // Auto-refresh every 2 minutes
    const interval = setInterval(loadActiveCrew, 120000);
    return () => clearInterval(interval);
  }, []);

  const getGpsStatus = (entry) => {
    if (entry.gpsDistanceFeet == null) return null;
    const onSite = entry.gpsDistanceFeet <= 500;
    return { onSite, feet: entry.gpsDistanceFeet, miles: entry.gpsDistanceMiles, address: entry.jobAddress };
  };

  const getElapsed = (clockIn) => {
    const mins = moment().diff(moment(clockIn), 'minutes');
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <Card sx={{ mb: 3, border: '1px solid #e0e0e0', boxShadow: 2 }}>
      <CardContent>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccessTimeIcon color="primary" />
            <Typography variant="h6" fontWeight="bold">
              Live Crew
            </Typography>
            {activeCrew.length > 0 && (
              <Chip
                label={`${activeCrew.length} clocked in`}
                size="small"
                color="success"
                sx={{ fontWeight: 'bold' }}
              />
            )}
          </Box>
          <Tooltip title={lastUpdated ? `Last updated ${moment(lastUpdated).format('h:mm A')}` : 'Refresh'}>
            <IconButton size="small" onClick={loadActiveCrew} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Content */}
        {loading ? (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Loading crew status...
            </Typography>
          </Box>
        ) : activeCrew.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              🏠 No crew currently clocked in
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {activeCrew.map((entry) => {
              const gps = getGpsStatus(entry);
              return (
                <Box
                  key={entry.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: gps
                      ? gps.onSite ? '#d7f0d8' : '#fde8c8'
                      : '#eeeeee',
                    border: gps
                      ? `1px solid ${gps.onSite ? '#66bb6a' : '#ffa726'}`
                      : '1px solid #bdbdbd',
                  }}
                >
                  {/* Left: Name + Job */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body1" fontWeight="bold" noWrap sx={{ color: '#212121' }}>
                      {entry.crewName}
                    </Typography>
                    <Typography variant="caption" noWrap sx={{ color: '#424242', fontWeight: 500 }}>
                      {entry.jobName} · {getElapsed(entry.clockIn)}
                    </Typography>
                    {gps?.address && (
                      <Typography variant="caption" display="block" noWrap sx={{ color: '#616161' }}>
                        📍 {gps.address}
                      </Typography>
                    )}
                  </Box>

                  {/* Right: GPS Badge */}
                  <Box sx={{ ml: 1, flexShrink: 0 }}>
                    {gps ? (
                      <Tooltip
                        title={`${gps.onSite ? '✅ ON SITE' : '⚠️ OFF SITE'} — ${gps.feet.toLocaleString()} ft (${gps.miles} mi) at clock-in`}
                      >
                        <Chip
                          icon={<GpsFixedIcon />}
                          label={gps.onSite
                            ? `✅ ${gps.feet} ft`
                            : `⚠️ ${gps.feet.toLocaleString()} ft`}
                          size="small"
                          sx={{
                            backgroundColor: gps.onSite ? '#388e3c' : '#e65100',
                            color: '#ffffff',
                            fontWeight: 'bold',
                            '& .MuiChip-icon': { color: '#ffffff' },
                          }}
                        />
                      </Tooltip>
                    ) : (
                      <Tooltip title="No GPS data at clock-in">
                        <Chip
                          icon={<GpsFixedIcon />}
                          label="No GPS"
                          size="small"
                          sx={{ backgroundColor: '#757575', color: '#ffffff', '& .MuiChip-icon': { color: '#ffffff' } }}
                        />
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}

        {lastUpdated && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1.5, textAlign: 'right', color: '#757575' }}>
            GPS data captured at clock-in · Updated {moment(lastUpdated).format('h:mm A')}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}