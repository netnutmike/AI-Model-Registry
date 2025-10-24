# Troubleshooting and FAQ

This document provides solutions to common issues and answers to frequently asked questions about the AI Model Registry platform.

## Table of Contents

1. [Common Issues](#common-issues)
2. [Authentication Problems](#authentication-problems)
3. [Model Management Issues](#model-management-issues)
4. [Upload and Download Problems](#upload-and-download-problems)
5. [Approval and Governance Issues](#approval-and-governance-issues)
6. [Performance Issues](#performance-issues)
7. [Frequently Asked Questions](#frequently-asked-questions)
8. [Getting Help](#getting-help)
9. [System Status](#system-status)

## Common Issues

### Cannot Access the Platform

**Symptoms:**
- Login page not loading
- "Service Unavailable" error
- Timeout errors

**Solutions:**

1. **Check System Status**
   - Visit the status page: [status.ai-model-registry.com](https://status.ai-model-registry.com)
   - Check for ongoing maintenance or outages

2. **Network Connectivity**
   ```bash
   # Test connectivity
   ping api.ai-model-registry.com
   
   # Check DNS resolution
   nslookup ai-model-registry.com
   ```

3. **Browser Issues**
   - Clear browser cache and cookies
   - Try incognito/private browsing mode
   - Try a different browser
   - Disable browser extensions temporarily

4. **VPN/Firewall**
   - Check if corporate VPN is required
   - Verify firewall settings allow access
   - Contact IT support for network issues

### Slow Performance

**Symptoms:**
- Pages loading slowly
- Timeouts during operations
- Unresponsive interface

**Solutions:**

1. **Browser Optimization**
   - Close unnecessary browser tabs
   - Clear browser cache
   - Update to latest browser version
   - Disable unnecessary extensions

2. **Network Issues**
   - Check internet connection speed
   - Try wired connection instead of WiFi
   - Contact network administrator

3. **Large File Handling**
   - Upload smaller files when possible
   - Use batch operations for multiple files
   - Consider using CLI tools for large uploads

## Authentication Problems

### Cannot Login with SSO

**Symptoms:**
- Redirected to SSO but login fails
- "Authentication Failed" error
- Stuck in login loop

**Solutions:**

1. **Check Credentials**
   - Verify username and password
   - Check if account is locked
   - Try logging into other company systems

2. **Clear Authentication State**
   ```javascript
   // Clear browser storage
   localStorage.clear();
   sessionStorage.clear();
   
   // Clear cookies for the domain
   document.cookie.split(";").forEach(function(c) { 
     document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
   });
   ```

3. **SSO Provider Issues**
   - Check if SSO provider is working
   - Contact IT support for SSO issues
   - Try alternative authentication methods if available

### Token Expired Errors

**Symptoms:**
- "Token expired" error messages
- Automatically logged out
- API calls failing with 401 errors

**Solutions:**

1. **Refresh Token**
   - The system should automatically refresh tokens
   - Try logging out and back in
   - Check if system clock is correct

2. **Session Management**
   - Avoid multiple browser tabs/windows
   - Don't share login sessions
   - Log out when finished

### Permission Denied

**Symptoms:**
- "Access Denied" or "Insufficient Permissions" errors
- Cannot perform certain actions
- Missing menu items or buttons

**Solutions:**

1. **Check User Role**
   - Go to Profile → Permissions
   - Verify your assigned roles
   - Contact admin if roles are incorrect

2. **Resource Ownership**
   - Check if you're listed as model owner
   - Verify group membership
   - Request access from model owner

3. **Role Assignment**
   - Contact system administrator
   - Submit access request ticket
   - Provide business justification

## Model Management Issues

### Cannot Create Model

**Symptoms:**
- "Model creation failed" error
- Form validation errors
- Submission hangs or times out

**Solutions:**

1. **Validation Errors**
   ```json
   // Check required fields
   {
     "name": "Must be unique within group",
     "group": "Must be valid group name",
     "description": "Cannot be empty",
     "owners": "Must include at least one valid email",
     "riskTier": "Must be LOW, MEDIUM, or HIGH"
   }
   ```

2. **Name Conflicts**
   - Choose a different model name
   - Check existing models in the group
   - Use descriptive, unique names

3. **Permission Issues**
   - Verify you have MODEL_OWNER role
   - Check group access permissions
   - Contact admin for role assignment

### Model Not Found

**Symptoms:**
- "Model not found" error
- Model missing from search results
- Broken links to models

**Solutions:**

1. **Search Issues**
   - Check spelling and search terms
   - Clear search filters
   - Try browsing by group

2. **Access Permissions**
   - Verify you have access to the model
   - Check if model is in restricted group
   - Contact model owner for access

3. **Model Status**
   - Check if model was deleted or retired
   - Look in archived models section
   - Contact admin for model recovery

### Version Creation Fails

**Symptoms:**
- Cannot create new version
- Version number conflicts
- Metadata validation errors

**Solutions:**

1. **Version Number Issues**
   - Use semantic versioning (e.g., 1.2.0)
   - Ensure version doesn't already exist
   - Follow version numbering conventions

2. **Metadata Validation**
   ```json
   // Required metadata fields
   {
     "framework": "e.g., pytorch, tensorflow",
     "frameworkVersion": "e.g., 1.12.0",
     "modelType": "e.g., bert-base, resnet50"
   }
   ```

3. **Git Integration**
   - Verify commit SHA is valid
   - Ensure commit exists in repository
   - Check repository access permissions

## Upload and Download Problems

### File Upload Fails

**Symptoms:**
- Upload progress stops
- "Upload failed" error
- Files not appearing after upload

**Solutions:**

1. **File Size Limits**
   - Check file size (max 5GB per file)
   - Compress large files if possible
   - Split large models into multiple files

2. **Network Issues**
   - Check internet connection stability
   - Try uploading smaller files first
   - Use wired connection for large uploads

3. **File Format Issues**
   - Verify file format is supported
   - Check file integrity (not corrupted)
   - Ensure proper file extensions

4. **Browser Issues**
   ```javascript
   // Check browser upload limits
   console.log('Max file size:', navigator.maxTouchPoints);
   
   // Monitor upload progress
   xhr.upload.addEventListener('progress', function(e) {
     console.log('Upload progress:', (e.loaded / e.total) * 100 + '%');
   });
   ```

### Download Issues

**Symptoms:**
- Download links not working
- Files corrupted after download
- Download permissions denied

**Solutions:**

1. **Link Expiration**
   - Download links expire after 1 hour
   - Generate new download link
   - Download immediately after generation

2. **File Integrity**
   ```bash
   # Verify file checksum after download
   sha256sum downloaded_file.bin
   # Compare with checksum shown in platform
   ```

3. **Browser Download Settings**
   - Check browser download location
   - Verify sufficient disk space
   - Disable download managers temporarily

### Checksum Verification Fails

**Symptoms:**
- "Checksum mismatch" error
- File integrity warnings
- Upload rejected due to checksum

**Solutions:**

1. **File Corruption**
   - Re-download or re-create the file
   - Check file during transfer
   - Use reliable transfer methods

2. **Checksum Calculation**
   ```bash
   # Calculate SHA256 checksum
   sha256sum model_file.bin
   
   # On macOS
   shasum -a 256 model_file.bin
   
   # On Windows
   certutil -hashfile model_file.bin SHA256
   ```

3. **Network Issues**
   - Use stable network connection
   - Retry upload with fresh file
   - Check for network interference

## Approval and Governance Issues

### Approval Stuck in Pending

**Symptoms:**
- Approval request not progressing
- No response from reviewers
- Approval taking longer than expected

**Solutions:**

1. **Check Approval Queue**
   - View approval dashboard
   - Check reviewer workload
   - Verify all requirements met

2. **Contact Reviewers**
   - Send reminder to MRC team
   - Provide additional context if needed
   - Escalate to management if urgent

3. **Review Requirements**
   - Ensure all evaluations pass
   - Check policy compliance
   - Verify documentation completeness

### Policy Violations

**Symptoms:**
- "Policy violation" errors
- Cannot promote model
- Compliance checks failing

**Solutions:**

1. **Identify Violations**
   ```json
   // Example policy violation response
   {
     "violations": [
       {
         "policy": "security-scan-required",
         "message": "Security scan must pass",
         "severity": "HIGH"
       }
     ]
   }
   ```

2. **Fix Violations**
   - Address each violation individually
   - Run required evaluations
   - Update documentation as needed

3. **Request Exception**
   - Submit exception request if needed
   - Provide business justification
   - Implement risk mitigation measures

### Evaluation Failures

**Symptoms:**
- Evaluation jobs failing
- Performance below thresholds
- Bias or fairness issues detected

**Solutions:**

1. **Performance Issues**
   - Review evaluation datasets
   - Check model training quality
   - Adjust evaluation thresholds if appropriate

2. **Bias Detection**
   - Analyze bias metrics in detail
   - Review training data for bias
   - Implement bias mitigation techniques

3. **Technical Failures**
   - Check evaluation configuration
   - Verify model format compatibility
   - Contact support for evaluation issues

## Performance Issues

### Slow Search Results

**Symptoms:**
- Search taking long time
- Timeouts during search
- Incomplete search results

**Solutions:**

1. **Optimize Search Query**
   - Use more specific search terms
   - Apply filters to narrow results
   - Avoid wildcard searches

2. **Browser Performance**
   - Close unnecessary tabs
   - Clear browser cache
   - Use latest browser version

3. **System Load**
   - Try searching during off-peak hours
   - Use pagination for large result sets
   - Contact support if persistent

### Large File Handling

**Symptoms:**
- Timeouts with large files
- Memory errors
- Slow upload/download speeds

**Solutions:**

1. **File Optimization**
   - Compress files when possible
   - Split large models into chunks
   - Use efficient file formats

2. **Network Optimization**
   - Use wired connection
   - Upload during off-peak hours
   - Consider using CLI tools

3. **Browser Limits**
   - Increase browser memory limits
   - Use dedicated upload tools
   - Contact support for large files

## Frequently Asked Questions

### General Questions

#### Q: What browsers are supported?
**A:** The platform supports:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

#### Q: Is there a mobile app?
**A:** Currently, only the web interface is available. A mobile app is planned for future release.

#### Q: Can I use the platform offline?
**A:** No, the platform requires internet connectivity for all operations.

#### Q: What file formats are supported for model artifacts?
**A:** Supported formats include:
- Model weights: .bin, .pth, .h5, .pb, .onnx
- Containers: Docker images
- Configs: .json, .yaml, .yml, .txt
- Archives: .zip, .tar.gz

### Model Management

#### Q: How many models can I create?
**A:** There's no hard limit on model count, but consider organizational guidelines and storage costs.

#### Q: Can I delete a model?
**A:** Models cannot be deleted for audit purposes. Instead, retire models by setting status to RETIRED.

#### Q: How do I transfer model ownership?
**A:** Contact an administrator to transfer ownership. Provide model ID and new owner details.

#### Q: Can I have multiple versions in production?
**A:** Yes, you can have multiple versions deployed simultaneously with traffic splitting.

### Governance and Compliance

#### Q: How long do approval processes take?
**A:** Typical approval times:
- LOW risk: Automated (< 5 minutes)
- MEDIUM risk: 1-3 business days
- HIGH risk: 3-5 business days

#### Q: Can I bypass governance policies?
**A:** Policies can only be bypassed through the formal exception process with proper approvals.

#### Q: How long are audit logs retained?
**A:** Audit logs are retained for 7 years for compliance purposes.

#### Q: Who can see my models?
**A:** Access is controlled by:
- Model ownership
- Group membership
- Role-based permissions
- Organizational policies

### Technical Questions

#### Q: What's the maximum file size for uploads?
**A:** Maximum file size is 5GB per individual file.

#### Q: How are checksums calculated?
**A:** SHA256 checksums are automatically calculated for all uploaded files.

#### Q: Can I integrate with CI/CD pipelines?
**A:** Yes, REST APIs and webhooks support CI/CD integration.

#### Q: Is there an API rate limit?
**A:** Yes, 1000 requests per hour per user. Contact support for higher limits.

### Security and Privacy

#### Q: How is my data protected?
**A:** Data protection includes:
- AES-256 encryption at rest
- TLS 1.3 encryption in transit
- Role-based access controls
- Regular security audits

#### Q: Can I see who accessed my models?
**A:** Yes, complete audit logs show all access to your models.

#### Q: How do I report security issues?
**A:** Report security issues immediately to security@company.com.

## Getting Help

### Self-Service Resources

1. **Documentation**
   - User guides and tutorials
   - API documentation
   - Video tutorials
   - Best practices guides

2. **In-Platform Help**
   - Contextual help tooltips
   - Built-in search
   - FAQ section
   - Status indicators

3. **Community Resources**
   - Internal forums
   - Knowledge base articles
   - User community discussions

### Support Channels

#### Help Desk
- **Portal**: [helpdesk.company.com](https://helpdesk.company.com)
- **Email**: support@company.com
- **Phone**: 1-800-SUPPORT
- **Hours**: 24/7 for critical issues, business hours for general support

#### Slack Channels
- **#ai-model-registry**: General questions and discussions
- **#ai-governance**: Governance and compliance questions
- **#ai-registry-alerts**: System alerts and notifications

#### Office Hours
- **When**: Fridays 2:00-3:00 PM EST
- **Where**: Zoom (link in calendar invite)
- **What**: Open Q&A session with product team

#### Training Sessions
- **New User Training**: Monthly sessions for new users
- **Advanced Features**: Quarterly deep-dive sessions
- **Governance Training**: Specialized training for MRC and Security teams

### Escalation Process

1. **Level 1**: Self-service resources and documentation
2. **Level 2**: Help desk ticket or Slack support
3. **Level 3**: Direct contact with product team
4. **Level 4**: Management escalation for critical issues

### When to Contact Support

#### Immediate Support (Critical)
- Security incidents
- Data loss or corruption
- System-wide outages
- Compliance violations

#### Standard Support (Business Hours)
- Feature questions
- Configuration help
- Training requests
- Enhancement suggestions

#### Self-Service (Anytime)
- Documentation questions
- Basic troubleshooting
- Account information
- General inquiries

### Information to Include in Support Requests

1. **Problem Description**
   - Clear description of the issue
   - Steps to reproduce
   - Expected vs. actual behavior

2. **Environment Information**
   - Browser and version
   - Operating system
   - Network environment
   - Time of occurrence

3. **User Information**
   - Username and role
   - Affected models/versions
   - Error messages (exact text)

4. **Screenshots/Logs**
   - Screenshots of errors
   - Browser console logs
   - Network request details

## System Status

### Status Page
Visit [status.ai-model-registry.com](https://status.ai-model-registry.com) for:
- Current system status
- Planned maintenance windows
- Historical uptime data
- Incident reports

### Maintenance Windows
- **Regular Maintenance**: Sundays 2:00-4:00 AM EST
- **Emergency Maintenance**: As needed with advance notice
- **Major Updates**: Quarterly with extended maintenance windows

### Service Level Agreements
- **Uptime**: 99.9% availability
- **Response Time**: < 500ms for 95% of requests
- **Support Response**: 
  - Critical: 1 hour
  - High: 4 hours
  - Medium: 1 business day
  - Low: 3 business days

This troubleshooting guide should help resolve most common issues. For problems not covered here, don't hesitate to contact support through the available channels.