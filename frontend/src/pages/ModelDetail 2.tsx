import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Chip,
  Button,
  Grid,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import {
  Storage,
  History,
  Description,
  CloudDownload,
  Assessment,
} from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { useModel, useModelVersions, useVersionArtifacts, useModelCard } from '@/hooks/useModels';
import { formatDateTime, formatFileSize, getVersionStateColor, getRiskTierColor } from '@/utils';

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

export const ModelDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [tabValue, setTabValue] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState<string>('');

  const { data: model, isLoading: modelLoading, error: modelError } = useModel(id!);
  const { data: versions = [], isLoading: versionsLoading } = useModelVersions(id!);
  const { data: artifacts = [] } = useVersionArtifacts(selectedVersion, !!selectedVersion);
  const { data: modelCard } = useModelCard(id!, selectedVersion);

  React.useEffect(() => {
    if (versions && versions.length > 0 && !selectedVersion) {
      // Select the latest version by default
      const latestVersion = [...versions].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];
      setSelectedVersion(latestVersion.id);
    }
  }, [versions, selectedVersion]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleDownloadArtifact = (artifactId: string, filename: string) => {
    // TODO: Implement artifact download
    console.log('Download artifact:', artifactId, filename);
  };

  if (modelLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (modelError || !model) {
    return (
      <Alert severity="error">
        Failed to load model details. Please try again later.
      </Alert>
    );
  }

  const currentVersion = versions ? versions.find(v => v.id === selectedVersion) : undefined;

  return (
    <Box>
      {/* Model Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={8}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Storage sx={{ mr: 2, fontSize: 32, color: 'primary.main' }} />
              <Box>
                <Typography variant="h4" component="h1">
                  {model.name}
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">
                  {model.group}
                </Typography>
              </Box>
            </Box>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {model.description}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {model.tags.map((tag) => (
                <Chip key={tag} label={tag} size="small" variant="outlined" />
              ))}
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
              <Chip
                label={model.riskTier}
                color={getRiskTierColor(model.riskTier)}
                sx={{ mb: 2 }}
              />
              <Typography variant="body2" color="text.secondary">
                Owners: {model.owners.join(', ')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Created: {formatDateTime(model.createdAt)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Updated: {formatDateTime(model.updatedAt)}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Version Selector */}
      {versions && versions.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Versions
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {(versions || []).map((version) => (
              <Chip
                key={version.id}
                label={version.version}
                color={selectedVersion === version.id ? 'primary' : 'default'}
                onClick={() => setSelectedVersion(version.id)}
                clickable
                variant={selectedVersion === version.id ? 'filled' : 'outlined'}
              />
            ))}
          </Box>
          {currentVersion && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                <Chip
                  label={currentVersion.state}
                  color={getVersionStateColor(currentVersion.state)}
                  size="small"
                />
                <Typography variant="body2" color="text.secondary">
                  Created: {formatDateTime(currentVersion.createdAt)}
                </Typography>
                {currentVersion.commitSha && (
                  <Typography variant="body2" color="text.secondary">
                    Commit: {currentVersion.commitSha.substring(0, 8)}
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </Paper>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab icon={<Description />} label="Overview" />
          <Tab icon={<Storage />} label="Artifacts" />
          <Tab icon={<Assessment />} label="Evaluations" />
          <Tab icon={<History />} label="History" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          {/* Overview Tab */}
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Model Information
              </Typography>
              <List>
                <ListItem>
                  <ListItemText
                    primary="Framework"
                    secondary={currentVersion?.metadata?.framework || 'Not specified'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Model Type"
                    secondary={currentVersion?.metadata?.modelType || 'Not specified'}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Risk Tier"
                    secondary={model.riskTier}
                  />
                </ListItem>
              </List>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Metrics
              </Typography>
              {currentVersion?.metadata?.metrics ? (
                <List>
                  {Object.entries(currentVersion.metadata.metrics).map(([key, value]) => (
                    <ListItem key={key}>
                      <ListItemText
                        primary={key}
                        secondary={typeof value === 'number' ? value.toFixed(4) : String(value)}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography color="text.secondary">No metrics available</Typography>
              )}
            </Grid>
          </Grid>

          {modelCard && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="h6" gutterBottom>
                Model Card
              </Typography>
              <Card>
                <CardContent>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>
                    {JSON.stringify(modelCard, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          {/* Artifacts Tab */}
          <Typography variant="h6" gutterBottom>
            Artifacts
          </Typography>
          {artifacts && artifacts.length > 0 ? (
            <List>
              {(artifacts || []).map((artifact) => (
                <ListItem
                  key={artifact.id}
                  secondaryAction={
                    <Button
                      startIcon={<CloudDownload />}
                      onClick={() => handleDownloadArtifact(artifact.id, `${artifact.type}-${artifact.id}`)}
                    >
                      Download
                    </Button>
                  }
                >
                  <ListItemIcon>
                    <Storage />
                  </ListItemIcon>
                  <ListItemText
                    primary={artifact.type}
                    secondary={
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Size: {formatFileSize(artifact.size)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          SHA256: {artifact.sha256.substring(0, 16)}...
                        </Typography>
                        {artifact.license && (
                          <Typography variant="body2" color="text.secondary">
                            License: {artifact.license}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography color="text.secondary">No artifacts available</Typography>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          {/* Evaluations Tab */}
          <Typography variant="h6" gutterBottom>
            Evaluations
          </Typography>
          <Typography color="text.secondary">
            Evaluation results will be displayed here
          </Typography>
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          {/* History Tab */}
          <Typography variant="h6" gutterBottom>
            Version History
          </Typography>
          {versionsLoading ? (
            <CircularProgress />
          ) : (
            <List>
              {(versions || []).map((version) => (
                <ListItem key={version.id}>
                  <ListItemIcon>
                    <History />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body1">{version.version}</Typography>
                        <Chip
                          label={version.state}
                          color={getVersionStateColor(version.state)}
                          size="small"
                        />
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Created: {formatDateTime(version.createdAt)}
                        </Typography>
                        {version.commitSha && (
                          <Typography variant="body2" color="text.secondary">
                            Commit: {version.commitSha}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </TabPanel>
      </Paper>
    </Box>
  );
};