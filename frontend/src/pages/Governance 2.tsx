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
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  Dashboard,
  Gavel,
  Assessment,
  History,
  Add,
  CheckCircle,
  Schedule,
  Error,
} from '@mui/icons-material';
import { useAuth } from '@/contexts/AuthContext';
import { useApprovalRequests, useGovernanceDashboard } from '@/hooks/useGovernance';
import { ApprovalCard } from '@/components/governance/ApprovalCard';
import { ApprovalReviewDialog } from '@/components/governance/ApprovalReviewDialog';
import { ApprovalRequest, ApprovalAction } from '@/services/governance';
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

export const Governance: React.FC = () => {
  const { user } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  const { data: dashboardData, isLoading: dashboardLoading } = useGovernanceDashboard();
  const { data: pendingApprovals = [], isLoading: approvalsLoading } = useApprovalRequests('pending');
  const { data: allApprovals = [] } = useApprovalRequests();

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleReviewApproval = (approvalId: string) => {
    const approval = allApprovals.find(a => a.id === approvalId);
    if (approval) {
      setSelectedApproval(approval);
      setReviewDialogOpen(true);
    }
  };

  const handleReviewSubmit = (action: ApprovalAction) => {
    // TODO: Implement review submission
    console.log('Review submitted:', action);
    setReviewDialogOpen(false);
    setSelectedApproval(null);
  };

  const canReview = user?.roles.some(role => ['MRC', 'Security_Architect'].includes(role.name));

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
          Governance & Compliance
        </Typography>
        {canReview && (
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => {
              // TODO: Navigate to policy creation
              console.log('Create new policy');
            }}
          >
            Create Policy
          </Button>
        )}
      </Box>

      {/* Dashboard Overview */}
      {dashboardData && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Schedule sx={{ mr: 2, color: 'warning.main' }} />
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      Pending Approvals
                    </Typography>
                    <Typography variant="h4">
                      {dashboardData.pendingApprovals}
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
                  <Error sx={{ mr: 2, color: 'error.main' }} />
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      Policy Violations
                    </Typography>
                    <Typography variant="h4">
                      {dashboardData.policyViolations}
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
                  <CheckCircle sx={{ mr: 2, color: 'success.main' }} />
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      Compliance Score
                    </Typography>
                    <Typography variant="h4">
                      {dashboardData.complianceScore}%
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
                  <Dashboard sx={{ mr: 2, color: 'primary.main' }} />
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      Active Policies
                    </Typography>
                    <Typography variant="h4">
                      12
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
          <Tab icon={<Schedule />} label="Pending Approvals" />
          <Tab icon={<Gavel />} label="Policies" />
          <Tab icon={<Assessment />} label="Compliance Reports" />
          <Tab icon={<History />} label="Audit History" />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        {/* Pending Approvals Tab */}
        <Box>
          {!canReview && (
            <Alert severity="info" sx={{ mb: 3 }}>
              You don't have permission to review approvals. Contact your administrator if you need access.
            </Alert>
          )}

          {approvalsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : pendingApprovals.length > 0 ? (
            <Grid container spacing={3}>
              {pendingApprovals.map((approval) => (
                <Grid item xs={12} md={6} lg={4} key={approval.id}>
                  <ApprovalCard
                    approval={approval}
                    onReview={canReview ? handleReviewApproval : undefined}
                  />
                </Grid>
              ))}
            </Grid>
          ) : (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No pending approvals
              </Typography>
              <Typography variant="body2" color="text.secondary">
                All approval requests have been processed.
              </Typography>
            </Box>
          )}
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        {/* Policies Tab */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Active Policies
          </Typography>
          <Typography color="text.secondary">
            Policy management interface will be implemented here.
          </Typography>
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        {/* Compliance Reports Tab */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Compliance Reports
          </Typography>
          <Typography color="text.secondary">
            Compliance reporting interface will be implemented here.
          </Typography>
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        {/* Audit History Tab */}
        <Box>
          <Typography variant="h6" gutterBottom>
            Recent Activity
          </Typography>
          {dashboardData?.recentActivity && dashboardData.recentActivity.length > 0 ? (
            <List>
              {dashboardData.recentActivity.map((activity, index) => (
                <ListItem key={index} divider>
                  <ListItemIcon>
                    <History />
                  </ListItemIcon>
                  <ListItemText
                    primary={activity.action}
                    secondary={`${activity.details} • ${formatRelativeTime(activity.timestamp)}`}
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography color="text.secondary">
              No recent activity to display.
            </Typography>
          )}
        </Box>
      </TabPanel>

      {/* Review Dialog */}
      <ApprovalReviewDialog
        open={reviewDialogOpen}
        approval={selectedApproval}
        onClose={() => {
          setReviewDialogOpen(false);
          setSelectedApproval(null);
        }}
        onSubmit={handleReviewSubmit}
      />
    </Box>
  );
};