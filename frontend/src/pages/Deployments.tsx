import React, { useState } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Grid,
  Card,
  CardContent,
  Button,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  CloudUpload,
  Dashboard,
  SwapHoriz,
  History,
  Add,
  Refresh,
} from '@mui/icons-material';
import { useAuth } from '@/contexts/AuthContext';
import { useDeployments, useDeploymentDashboard, useTrafficSplit } from '@/hooks/useDeployments';
import { DeploymentCard } from '@/components/deployments/DeploymentCard';
import { TrafficSplitControl } from '@/components/deployments/TrafficSplitControl';
import { formatRelativeTime } from '@/utils';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
};

export const Deployments: React.FC = () => {
  const { user } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [selectedEnvironment, setSelectedEnvironment] = useState<'staging' | 'production'>('staging');

  const { data: dashboardData, isLoading: dashboardLoading } = useDeploymentDashboard();
  const { data: deployments = [], isLoading: deploymentsLoading, refetch: refetchDeployments } = useDeployments();
  const { data: trafficSplits = [] } = useTrafficSplit(selectedEnvironment);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleEnvironmentChange = (event: any) => {
    setSelectedEnvironment(event.target.value);
  };

  const handleCreateDeployment = () => {
    // TODO: Navigate to deployment creation
    console.log('Create new deployment');
  };

  const handleViewDeployment = (id: string) => {
    // TODO: Navigate to deployment details
    console.log('View deployment:', id);
  };

  const handleStopDeployment = (id: string) => {
    // TODO: Implement stop deployment
    console.log('Stop deployment:', id);
  };

  const handleRollbackDeployment = (id: string) => {
    // TODO: Implement rollback
    console.log('Rollback deployment:', id);
  };

  const handleDeleteDeployment = (id: string) => {
    // TODO: Implement delete deployment
    console.log('Delete deployment:', id);
  };

  const handleUpdateTrafficSplit = (splits: any[]) => {
    // TODO: Implement traffic split update
    console.log('Update traffic split:', splits);
  };

  const canDeploy = user?.roles.some(role => ['SRE', 'Model_Owner'].includes(role.name));

  if (dashboardLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Deployment Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<Refresh />}
            onClick={() => refetchDeployments()}
          >
            Refresh
          </Button>
          {canDeploy && (
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleCreateDeployment}
            >
              New Deployment
            </Button>
          )}
        </Box>
      </Box>

      {/* Dashboard Overview */}
      {dashboardData && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <CloudUpload sx={{ mr: 2, color: 'primary.main' }} />
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      Total Deployments
                    </Typography>
                    <Typography variant="h4">
                      {dashboardData.totalDeployments}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Dashboard sx={{ mr: 2, color: 'success.main' }} />
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      Active Deployments
                    </Typography>
                    <Typography variant="h4">
                      {dashboardData.activeDeployments}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Alert sx={{ mr: 2, color: 'error.main' }} />
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      Failed Deployments
                    </Typography>
                    <Typography variant="h4">
                      {dashboardData.failedDeployments}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <History sx={{ mr: 2, color: 'info.main' }} />
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      Average Uptime
                    </Typography>
                    <Typography variant="h4">
                      {dashboardData.averageUptime.toFixed(1)}%
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab icon={<Dashboard />} label="Overview" />
          <Tab icon={<SwapHoriz />} label="Traffic Management" />
          <Tab icon={<History />} label="History" />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        {/* Overview Tab */}
        <Box>
          {!canDeploy && (
            <Alert severity="info" sx={{ mb: 3 }}>
              You don't have permission to manage deployments. Contact your administrator if you need access.
            </Alert>
          )}

          {deploymentsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : deployments.length > 0 ? (
            <Grid container spacing={3}>
              {deployments.map((deployment) => (
                <Grid item xs={12} md={6} lg={4} key={deployment.id}>
                  <DeploymentCard
                    deployment={deployment}
                    onView={handleViewDeployment}
                    onStop={canDeploy ? handleStopDeployment : undefined}
                    onRollback={canDeploy ? handleRollbackDeployment : undefined}
                    onDelete={canDeploy ? handleDeleteDeployment : undefined}
                  />
                </Grid>
              ))}
            </Grid>
          ) : (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <CloudUpload sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No deployments found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {canDeploy
                  ? 'Get started by creating your first deployment.'
                  : 'No deployments have been created yet.'}
              </Typography>
              {canDeploy && (
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={handleCreateDeployment}
                >
                  Create Deployment
                </Button>
              )}
            </Box>
          )}
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        {/* Traffic Management Tab */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <Typography variant="h6">
              Traffic Management
            </Typography>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Environment</InputLabel>
              <Select
                value={selectedEnvironment}
                onChange={handleEnvironmentChange}
                label="Environment"
              >
                <MenuItem value="staging">Staging</MenuItem>
                <MenuItem value="production">Production</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {!canDeploy && (
            <Alert severity="info" sx={{ mb: 3 }}>
              You don't have permission to manage traffic splits. Contact your administrator if you need access.
            </Alert>
          )}

          <TrafficSplitControl
            deployments={deployments}
            currentSplits={trafficSplits}
            environment={selectedEnvironment}
            onUpdate={canDeploy ? handleUpdateTrafficSplit : () => {}}
            isLoading={!canDeploy}
          />
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        {/* History Tab */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Recent Deployments
          </Typography>
          {dashboardData?.recentDeployments && dashboardData.recentDeployments.length > 0 ? (
            <Grid container spacing={2}>
              {dashboardData.recentDeployments.map((deployment) => (
                <Grid item xs={12} key={deployment.id}>
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                          <Typography variant="h6">
                            {deployment.versionId}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {deployment.environment} • {deployment.status}
                          </Typography>
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {formatRelativeTime(deployment.createdAt)}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Typography color="text.secondary">
              No deployment history available.
            </Typography>
          )}
        </Box>
      </TabPanel>
    </Box>
  );
};