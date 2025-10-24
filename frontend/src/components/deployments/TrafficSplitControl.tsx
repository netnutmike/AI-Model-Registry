import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Slider,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Alert,
  Chip,
  Divider,
} from '@mui/material';
import { Save, Refresh } from '@mui/icons-material';
import { TrafficSplit } from '@/services/deployments';
import { Deployment } from '@/types';

interface TrafficSplitControlProps {
  deployments: Deployment[];
  currentSplits: TrafficSplit[];
  environment: 'staging' | 'production';
  onUpdate: (splits: TrafficSplit[]) => void;
  isLoading?: boolean;
}

export const TrafficSplitControl: React.FC<TrafficSplitControlProps> = ({
  deployments,
  currentSplits,
  environment,
  onUpdate,
  isLoading = false,
}) => {
  const [splits, setSplits] = useState<TrafficSplit[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Filter deployments for the current environment and active status
  const activeDeployments = deployments.filter(
    d => d.environment === environment && d.status === 'active'
  );

  useEffect(() => {
    // Initialize splits from current splits or create default splits
    const initialSplits = activeDeployments.map(deployment => {
      const existingSplit = currentSplits.find(s => s.deploymentId === deployment.id);
      return {
        deploymentId: deployment.id,
        percentage: existingSplit?.percentage || 0,
      };
    });

    // Ensure total is 100% - assign remaining to first deployment if needed
    const total = initialSplits.reduce((sum, split) => sum + split.percentage, 0);
    if (total === 0 && initialSplits.length > 0) {
      initialSplits[0].percentage = 100;
    }

    setSplits(initialSplits);
    setHasChanges(false);
  }, [activeDeployments, currentSplits]);

  const handleSliderChange = (deploymentId: string, value: number) => {
    const newSplits = splits.map(split =>
      split.deploymentId === deploymentId
        ? { ...split, percentage: value }
        : split
    );

    // Ensure total doesn't exceed 100%
    const total = newSplits.reduce((sum, split) => sum + split.percentage, 0);
    if (total <= 100) {
      setSplits(newSplits);
      setHasChanges(true);
    }
  };

  const handleAutoBalance = () => {
    if (splits.length === 0) return;

    const equalPercentage = Math.floor(100 / splits.length);
    const remainder = 100 - (equalPercentage * splits.length);

    const balancedSplits = splits.map((split, index) => ({
      ...split,
      percentage: equalPercentage + (index === 0 ? remainder : 0),
    }));

    setSplits(balancedSplits);
    setHasChanges(true);
  };

  const handleSave = () => {
    onUpdate(splits);
    setHasChanges(false);
  };

  const handleReset = () => {
    const resetSplits = activeDeployments.map(deployment => {
      const existingSplit = currentSplits.find(s => s.deploymentId === deployment.id);
      return {
        deploymentId: deployment.id,
        percentage: existingSplit?.percentage || 0,
      };
    });
    setSplits(resetSplits);
    setHasChanges(false);
  };

  const totalPercentage = splits.reduce((sum, split) => sum + split.percentage, 0);
  const isValidSplit = totalPercentage === 100;

  if (activeDeployments.length === 0) {
    return (
      <Alert severity="info">
        No active deployments found for {environment} environment.
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h6">
            Traffic Split - {environment.charAt(0).toUpperCase() + environment.slice(1)}
          </Typography>
          <Chip
            label={`${totalPercentage}%`}
            color={isValidSplit ? 'success' : 'error'}
          />
        </Box>

        {!isValidSplit && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Traffic split must total exactly 100%. Current total: {totalPercentage}%
          </Alert>
        )}

        <Grid container spacing={2}>
          {splits.map((split) => {
            const deployment = activeDeployments.find(d => d.id === split.deploymentId);
            if (!deployment) return null;

            return (
              <Grid item xs={12} key={split.deploymentId}>
                <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box>
                      <Typography variant="subtitle1">
                        {deployment.versionId}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Deployment ID: {deployment.id}
                      </Typography>
                    </Box>
                    <Typography variant="h6" color="primary">
                      {split.percentage}%
                    </Typography>
                  </Box>

                  <Slider
                    value={split.percentage}
                    onChange={(_, value) => handleSliderChange(split.deploymentId, value as number)}
                    min={0}
                    max={100}
                    step={1}
                    marks={[
                      { value: 0, label: '0%' },
                      { value: 25, label: '25%' },
                      { value: 50, label: '50%' },
                      { value: 75, label: '75%' },
                      { value: 100, label: '100%' },
                    ]}
                    valueLabelDisplay="auto"
                    disabled={isLoading}
                  />
                </Box>
              </Grid>
            );
          })}
        </Grid>

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={handleAutoBalance}
            disabled={isLoading || splits.length <= 1}
          >
            Auto Balance
          </Button>
        </Box>
      </CardContent>

      <CardActions>
        <Button
          startIcon={<Refresh />}
          onClick={handleReset}
          disabled={!hasChanges || isLoading}
        >
          Reset
        </Button>
        <Button
          variant="contained"
          startIcon={<Save />}
          onClick={handleSave}
          disabled={!hasChanges || !isValidSplit || isLoading}
        >
          Apply Changes
        </Button>
      </CardActions>
    </Card>
  );
};