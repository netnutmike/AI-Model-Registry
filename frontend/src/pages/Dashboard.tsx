import React from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import { useAuth } from '@/contexts/AuthContext';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();

  // Mock data for dashboard - in real app this would come from API
  const stats = {
    totalModels: 42,
    activeDeployments: 8,
    pendingApprovals: 3,
    failedEvaluations: 1,
  };

  const recentActivity = [
    { id: 1, action: 'Model registered', model: 'fraud-detection-v2.1.0', time: '2 hours ago' },
    { id: 2, action: 'Deployment completed', model: 'recommendation-engine-v1.5.2', time: '4 hours ago' },
    { id: 3, action: 'Evaluation failed', model: 'sentiment-analysis-v3.0.0', time: '6 hours ago' },
    { id: 4, action: 'Policy updated', model: 'Security Policy v2', time: '1 day ago' },
  ];

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Welcome back, {user?.name}
      </Typography>
      
      <Grid container spacing={3}>
        {/* Stats Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Total Models
              </Typography>
              <Typography variant="h4">
                {stats.totalModels}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Active Deployments
              </Typography>
              <Typography variant="h4">
                {stats.activeDeployments}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Pending Approvals
              </Typography>
              <Typography variant="h4" color="warning.main">
                {stats.pendingApprovals}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Failed Evaluations
              </Typography>
              <Typography variant="h4" color="error.main">
                {stats.failedEvaluations}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Activity */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent Activity
            </Typography>
            <List>
              {recentActivity.map((activity) => (
                <ListItem key={activity.id} divider>
                  <ListItemText
                    primary={activity.action}
                    secondary={`${activity.model} • ${activity.time}`}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* User Info */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Your Profile
            </Typography>
            <Typography variant="body2" color="textSecondary" gutterBottom>
              Email: {user?.email}
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" gutterBottom>
                Roles:
              </Typography>
              {user?.roles.map((role) => (
                <Chip
                  key={role.id}
                  label={role.name}
                  size="small"
                  sx={{ mr: 1, mb: 1 }}
                />
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};