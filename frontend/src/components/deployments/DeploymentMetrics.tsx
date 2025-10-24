import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  Chip,
} from '@mui/material';
import {
  Speed,
  Timer,
  Error,
  Memory,
  Computer,
  TrendingUp,
} from '@mui/icons-material';
import { DeploymentMetrics as MetricsType } from '@/services/deployments';

interface DeploymentMetricsProps {
  metrics: MetricsType;
  isLoading?: boolean;
}

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  unit?: string;
  icon: React.ReactNode;
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  progress?: number;
  threshold?: { warning: number; critical: number };
}> = ({ title, value, unit, icon, color = 'primary', progress, threshold }) => {
  const getProgressColor = () => {
    if (!threshold || progress === undefined) return color;
    
    if (progress >= threshold.critical) return 'error';
    if (progress >= threshold.warning) return 'warning';
    return 'success';
  };

  const getStatusChip = () => {
    if (!threshold || progress === undefined) return null;
    
    if (progress >= threshold.critical) {
      return <Chip label="Critical" color="error" size="small" />;
    }
    if (progress >= threshold.warning) {
      return <Chip label="Warning" color="warning" size="small" />;
    }
    return <Chip label="Healthy" color="success" size="small" />;
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box sx={{ mr: 2, color: `${color}.main` }}>
              {icon}
            </Box>
            <Typography variant="h6" component="div">
              {typeof value === 'number' ? value.toLocaleString() : value}
              {unit && <Typography component="span" variant="body2" color="text.secondary"> {unit}</Typography>}
            </Typography>
          </Box>
          {getStatusChip()}
        </Box>
        
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {title}
        </Typography>
        
        {progress !== undefined && (
          <LinearProgress
            variant="determinate"
            value={Math.min(progress, 100)}
            color={getProgressColor()}
            sx={{ mt: 1, height: 8, borderRadius: 4 }}
          />
        )}
      </CardContent>
    </Card>
  );
};

export const DeploymentMetrics: React.FC<DeploymentMetricsProps> = ({ metrics, isLoading }) => {
  if (isLoading) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          Performance Metrics
        </Typography>
        <Grid container spacing={2}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Card>
                <CardContent>
                  <LinearProgress />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Performance Metrics
      </Typography>
      
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="Requests per Second"
            value={metrics.requestsPerSecond}
            unit="req/s"
            icon={<Speed />}
            color="primary"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="Average Latency"
            value={metrics.averageLatency}
            unit="ms"
            icon={<Timer />}
            color="info"
            threshold={{ warning: 500, critical: 1000 }}
            progress={metrics.averageLatency}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="Error Rate"
            value={`${(metrics.errorRate * 100).toFixed(2)}%`}
            icon={<Error />}
            color="error"
            progress={metrics.errorRate * 100}
            threshold={{ warning: 1, critical: 5 }}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="CPU Usage"
            value={`${metrics.cpuUsage.toFixed(1)}%`}
            icon={<Computer />}
            color="warning"
            progress={metrics.cpuUsage}
            threshold={{ warning: 70, critical: 90 }}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="Memory Usage"
            value={`${metrics.memoryUsage.toFixed(1)}%`}
            icon={<Memory />}
            color="secondary"
            progress={metrics.memoryUsage}
            threshold={{ warning: 80, critical: 95 }}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="Uptime"
            value={formatUptime(metrics.uptime)}
            icon={<TrendingUp />}
            color="success"
          />
        </Grid>
      </Grid>
    </Box>
  );
};