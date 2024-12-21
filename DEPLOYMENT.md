# Learning Atomizer Production Deployment Guide

## Overview
This guide provides comprehensive instructions for deploying the Learning Atomizer platform in a production environment. The deployment is designed to be highly available, scalable, and secure.

## Prerequisites
- AWS Account with appropriate IAM permissions
- Kubernetes cluster management experience
- Domain name and SSL certificates
- CI/CD pipeline access
- Infrastructure as Code tools (Terraform/CloudFormation)
- Monitoring and logging tools

## Infrastructure Setup

### 1. AWS Infrastructure
```bash
# Initialize Terraform
terraform init

# Plan deployment
terraform plan -var-file=production.tfvars

# Apply infrastructure
terraform apply -var-file=production.tfvars
```

### 2. Kubernetes Clusters
```bash
# Create primary cluster
eksctl create cluster -f cluster-config-primary.yaml

# Create secondary cluster
eksctl create cluster -f cluster-config-secondary.yaml

# Configure kubectl context
aws eks update-kubeconfig --name primary-cluster
```

### 3. Database Setup
```bash
# Deploy MongoDB cluster
kubectl apply -f mongodb/

# Deploy Redis cluster
kubectl apply -f redis/

# Initialize database
kubectl apply -f database-init/
```

## Application Deployment

### 1. Container Registry Setup
```bash
# Build and push server image
docker build -t learning-atomizer-server ./server
docker tag learning-atomizer-server:latest [ECR_URL]/learning-atomizer-server:latest
docker push [ECR_URL]/learning-atomizer-server:latest

# Build and push client image
docker build -t learning-atomizer-client ./client
docker tag learning-atomizer-client:latest [ECR_URL]/learning-atomizer-client:latest
docker push [ECR_URL]/learning-atomizer-client:latest
```

### 2. Application Deployment
```bash
# Deploy server components
kubectl apply -f k8s/server/

# Deploy client components
kubectl apply -f k8s/client/

# Verify deployments
kubectl get deployments -n learning-atomizer
```

### 3. Service Configuration
```bash
# Deploy services
kubectl apply -f k8s/services/

# Configure ingress
kubectl apply -f k8s/ingress/

# Verify services
kubectl get services -n learning-atomizer
```

## Monitoring Setup

### 1. Prometheus & Grafana
```bash
# Install Prometheus operator
helm install prometheus prometheus-community/kube-prometheus-stack

# Configure Grafana dashboards
kubectl apply -f monitoring/dashboards/

# Verify monitoring
kubectl get pods -n monitoring
```

### 2. Logging Stack
```bash
# Deploy EFK stack
kubectl apply -f logging/

# Verify logging components
kubectl get pods -n logging
```

### 3. Alert Configuration
```bash
# Configure alert rules
kubectl apply -f monitoring/alerts/

# Test alert system
kubectl apply -f monitoring/test-alert.yaml
```

## Security Configuration

### 1. SSL/TLS Setup
```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.8.0/cert-manager.yaml

# Configure certificates
kubectl apply -f certificates/production/

# Verify certificates
kubectl get certificates -n cert-manager
```

### 2. Network Policies
```bash
# Apply network policies
kubectl apply -f security/network-policies/

# Verify policies
kubectl get networkpolicies -n learning-atomizer
```

### 3. Security Scanning
```bash
# Run security scan
trivy image [ECR_URL]/learning-atomizer-server:latest
trivy image [ECR_URL]/learning-atomizer-client:latest

# Apply security policies
kubectl apply -f security/policies/
```

## Backup Configuration

### 1. Database Backups
```bash
# Configure backup schedule
kubectl apply -f backup/schedule/

# Verify backup jobs
kubectl get cronjobs -n learning-atomizer
```

### 2. Disaster Recovery
```bash
# Configure DR policies
kubectl apply -f disaster-recovery/

# Test DR procedures
./scripts/test-dr.sh
```

## Performance Optimization

### 1. CDN Setup
```bash
# Configure CloudFront
aws cloudfront create-distribution --distribution-config file://cdn/cloudfront-config.json

# Verify CDN
aws cloudfront list-distributions
```

### 2. Cache Configuration
```bash
# Configure Redis cache
kubectl apply -f cache/redis-config.yaml

# Verify cache settings
kubectl exec -it redis-0 -- redis-cli INFO
```

## Post-Deployment Verification

### 1. Health Checks
```bash
# Check application health
kubectl get pods -n learning-atomizer
kubectl logs -f deployment/server -n learning-atomizer
kubectl logs -f deployment/client -n learning-atomizer

# Check database health
kubectl exec -it mongodb-0 -- mongo --eval "rs.status()"
kubectl exec -it redis-0 -- redis-cli PING
```

### 2. Performance Tests
```bash
# Run load tests
k6 run load-tests/production.js

# Monitor results
kubectl port-forward svc/grafana 3000:3000 -n monitoring
```

### 3. Security Verification
```bash
# Run security tests
./scripts/security-scan.sh

# Verify compliance
./scripts/compliance-check.sh
```

## Maintenance Procedures

### 1. Updates and Patches
```bash
# Update application
kubectl apply -f k8s/server/update/
kubectl apply -f k8s/client/update/

# Verify updates
kubectl rollout status deployment/server -n learning-atomizer
kubectl rollout status deployment/client -n learning-atomizer
```

### 2. Scaling
```bash
# Scale application
kubectl scale deployment server --replicas=5 -n learning-atomizer
kubectl scale deployment client --replicas=3 -n learning-atomizer

# Verify scaling
kubectl get hpa -n learning-atomizer
```

### 3. Monitoring
```bash
# Access monitoring dashboards
kubectl port-forward svc/grafana 3000:3000 -n monitoring
kubectl port-forward svc/kibana 5601:5601 -n logging

# Check alerts
kubectl get prometheusalerts
```

## Troubleshooting

### Common Issues
1. **Pod Crashes**
   ```bash
   kubectl describe pod [pod-name] -n learning-atomizer
   kubectl logs [pod-name] -n learning-atomizer --previous
   ```

2. **Database Issues**
   ```bash
   kubectl exec -it mongodb-0 -- mongo --eval "db.serverStatus()"
   kubectl exec -it redis-0 -- redis-cli INFO
   ```

3. **Network Issues**
   ```bash
   kubectl get events -n learning-atomizer
   kubectl describe ingress -n learning-atomizer
   ```

### Support Contacts
- Infrastructure Team: infra@learning-atomizer.com
- DevOps Team: devops@learning-atomizer.com
- Security Team: security@learning-atomizer.com

## Compliance and Auditing

### 1. Audit Logs
- All system logs are retained for 30 days
- Security logs are retained for 90 days
- Access logs are retained for 1 year

### 2. Compliance Reports
- Generate monthly compliance reports
- Perform quarterly security audits
- Annual penetration testing

## References
- [AWS Documentation](https://docs.aws.amazon.com/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Learning Atomizer Architecture](./ARCHITECTURE.md)
- [Security Policies](./SECURITY.md)
