# Infrastructure Configuration

This directory contains AWS CloudFormation templates for setting up the infrastructure components required by the AI Model Registry platform.

## Components

### Aurora PostgreSQL Cluster (`aurora-cluster.yaml`)
- Aurora PostgreSQL cluster with read replicas
- Automated backups and point-in-time recovery
- Enhanced monitoring and Performance Insights
- Security groups and parameter groups
- Secrets Manager integration for credentials

### Redis Cluster (`redis-cluster.yaml`)
- ElastiCache Redis cluster with replication
- Multi-AZ deployment for high availability
- Encryption at rest and in transit
- CloudWatch monitoring and alarms
- Auth token management via Secrets Manager

### Backup Policy (`backup-policy.yaml`)
- AWS Backup configuration for Aurora and Redis
- Daily and weekly backup schedules
- Cross-region backup replication
- Lifecycle policies for cost optimization
- CloudWatch alarms for backup monitoring

### Disaster Recovery (`disaster-recovery.yaml`)
- Aurora Global Database for cross-region replication
- S3 cross-region replication for artifacts
- Lambda-based DR orchestration
- RTO/RPO monitoring and alerting
- Automated failover procedures

## Deployment

### Prerequisites
1. AWS CLI configured with appropriate permissions
2. VPC and subnets already created
3. Route 53 hosted zone (if using custom domain)

### Deployment Order
Deploy the templates in the following order:

1. **Aurora Cluster**
   ```bash
   aws cloudformation create-stack \
     --stack-name ai-model-registry-aurora \
     --template-body file://aurora-cluster.yaml \
     --parameters ParameterKey=VpcId,ParameterValue=vpc-xxxxxxxx \
                  ParameterKey=PrivateSubnetIds,ParameterValue="subnet-xxxxxxxx,subnet-yyyyyyyy" \
                  ParameterKey=Environment,ParameterValue=production \
     --capabilities CAPABILITY_IAM
   ```

2. **Redis Cluster**
   ```bash
   aws cloudformation create-stack \
     --stack-name ai-model-registry-redis \
     --template-body file://redis-cluster.yaml \
     --parameters ParameterKey=VpcId,ParameterValue=vpc-xxxxxxxx \
                  ParameterKey=PrivateSubnetIds,ParameterValue="subnet-xxxxxxxx,subnet-yyyyyyyy" \
                  ParameterKey=Environment,ParameterValue=production \
     --capabilities CAPABILITY_IAM
   ```

3. **Backup Policy**
   ```bash
   aws cloudformation create-stack \
     --stack-name ai-model-registry-backup \
     --template-body file://backup-policy.yaml \
     --parameters ParameterKey=Environment,ParameterValue=production \
                  ParameterKey=AuroraClusterArn,ParameterValue=arn:aws:rds:region:account:cluster:cluster-name \
                  ParameterKey=RedisClusterArn,ParameterValue=arn:aws:elasticache:region:account:replicationgroup:group-name \
     --capabilities CAPABILITY_IAM
   ```

4. **Disaster Recovery**
   ```bash
   aws cloudformation create-stack \
     --stack-name ai-model-registry-dr \
     --template-body file://disaster-recovery.yaml \
     --parameters ParameterKey=Environment,ParameterValue=production \
                  ParameterKey=PrimaryRegion,ParameterValue=us-west-2 \
                  ParameterKey=DRRegion,ParameterValue=us-east-1 \
                  ParameterKey=S3BucketName,ParameterValue=ai-model-registry-artifacts \
                  ParameterKey=AuroraClusterIdentifier,ParameterValue=ai-model-registry-aurora-cluster \
     --capabilities CAPABILITY_IAM
   ```

## Configuration

### Environment Variables
After deployment, update the Kubernetes secrets with the following values from CloudFormation outputs:

```bash
# Database configuration
kubectl create secret generic postgresql-credentials \
  --from-literal=host=$(aws cloudformation describe-stacks --stack-name ai-model-registry-aurora --query 'Stacks[0].Outputs[?OutputKey==`ClusterEndpoint`].OutputValue' --output text) \
  --from-literal=username=postgres \
  --from-literal=password=$(aws secretsmanager get-secret-value --secret-id ai-model-registry-aurora-db-credentials --query SecretString --output text | jq -r .password)

# Redis configuration
kubectl create secret generic redis-credentials \
  --from-literal=host=$(aws cloudformation describe-stacks --stack-name ai-model-registry-redis --query 'Stacks[0].Outputs[?OutputKey==`RedisEndpoint`].OutputValue' --output text) \
  --from-literal=password=$(aws secretsmanager get-secret-value --secret-id ai-model-registry-redis-auth-token --query SecretString --output text)
```

### Monitoring
The infrastructure includes comprehensive monitoring:

- **Aurora**: Performance Insights, Enhanced Monitoring, CloudWatch metrics
- **Redis**: CloudWatch metrics for CPU, memory, connections
- **Backups**: Success/failure monitoring, retention compliance
- **DR**: RTO/RPO monitoring, failover event tracking

### Security
Security features included:

- **Encryption**: At rest and in transit for all data stores
- **Network**: VPC security groups with least privilege access
- **Secrets**: AWS Secrets Manager for credential management
- **Backup**: Encrypted backups with KMS keys
- **Audit**: CloudTrail logging for all infrastructure changes

## Disaster Recovery Procedures

### RTO/RPO Targets
- **RTO (Recovery Time Objective)**: 4 hours
- **RPO (Recovery Point Objective)**: 1 hour

### Failover Process
1. **Automatic**: Aurora Global Database handles automatic failover
2. **Manual**: Use the DR orchestration Lambda function
3. **Application**: Update Kubernetes secrets to point to DR region

### Testing
Regular DR testing should be performed:
- Monthly: Test backup restoration
- Quarterly: Full DR failover test
- Annually: Complete disaster recovery simulation

## Cost Optimization

### Aurora
- Use Aurora Serverless v2 for non-production environments
- Enable Aurora I/O Optimized for high I/O workloads
- Configure appropriate backup retention periods

### Redis
- Use appropriate node types based on memory requirements
- Enable cluster mode for better cost efficiency
- Configure appropriate snapshot retention

### Backups
- Use lifecycle policies to move old backups to cheaper storage
- Configure appropriate retention periods
- Use cross-region replication only for critical data

## Troubleshooting

### Common Issues
1. **Connection timeouts**: Check security group rules
2. **High CPU/Memory**: Scale up instance types or add read replicas
3. **Backup failures**: Check IAM permissions and storage limits
4. **DR sync lag**: Monitor replication lag metrics

### Monitoring Dashboards
Create CloudWatch dashboards for:
- Database performance metrics
- Redis performance metrics
- Backup success rates
- DR replication lag
- Cost tracking