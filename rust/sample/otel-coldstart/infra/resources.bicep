param location string
param tags object
param deployerObjectId string
param probeEnabled bool
param nodeOtelProbeEnabled bool

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-otel-coldstart-86a4'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-otel-coldstart-86a4'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    DisableLocalAuth: true
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-otel-cs-86a4'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    networkAcls: { defaultAction: 'Allow', bypass: 'AzureServices' }
  }
}

resource deployerSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, deployerObjectId, 'secrets-officer')
  scope: vault
  properties: {
    principalId: deployerObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
  }
}

module treatment './function-app.bicep' = {
  name: 'customer-exe'
  params: {
    location: location
    tags: tags
    appName: 'otel-coldstart-exe-86a4'
    planName: 'plan-otel-coldstart-exe-86a4'
    storageName: 'stotelcsexe86a4'
    identityName: 'id-otel-coldstart-exe-86a4'
    applicationInsightsName: insights.name
    connectionString: insights.properties.ConnectionString
    appSettings: {
      BENCHMARK_VARIANT: 'customer-exe'
      OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'http,dns,fetch,logs'
      OTEL_SERVICE_NAME: 'otel-coldstart-exe-86a4'
      OTEL_TRACES_SAMPLER: 'always_on'
      AZURE_FUNCTIONS_OTEL_EXPORTER: 'console'
    }
  }
}

module baseline './function-app.bicep' = {
  name: 'baseline'
  params: {
    location: location
    tags: tags
    appName: 'otel-coldstart-baseline-86a4'
    planName: 'plan-otel-coldstart-baseline-86a4'
    storageName: 'stotelcsbase86a4'
    identityName: 'id-otel-coldstart-baseline-86a4'
    applicationInsightsName: insights.name
    connectionString: insights.properties.ConnectionString
    appSettings: { BENCHMARK_VARIANT: 'baseline' }
  }
}

module nodeOtel './function-app.bicep' = {
  name: 'node-otel'
  params: {
    location: location
    tags: tags
    appName: 'otel-coldstart-node-86a4'
    planName: 'plan-otel-coldstart-node-86a4'
    storageName: 'stotelcsnode86a4'
    identityName: 'id-otel-coldstart-node-86a4'
    applicationInsightsName: insights.name
    connectionString: insights.properties.ConnectionString
    appSettings: {
      BENCHMARK_VARIANT: 'node-otel'
      OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'http,dns,fetch,logs'
      OTEL_SERVICE_NAME: 'otel-coldstart-node-86a4'
      OTEL_TRACES_SAMPLER: 'always_on'
      OTEL_SDK_DISABLED: 'false'
      OTEL_METRICS_EXPORTER: 'none'
    }
  }
}

module probe './function-app.bicep' = {
  name: 'probe'
  params: {
    location: location
    tags: tags
    appName: 'otel-coldstart-probe-86a4'
    planName: 'plan-otel-coldstart-probe-86a4'
    storageName: 'stotelcsprobe86a4'
    identityName: 'id-otel-coldstart-probe-86a4'
    applicationInsightsName: insights.name
    connectionString: insights.properties.ConnectionString
    appSettings: {
      BENCHMARK_VARIANT: 'probe'
      PROBE_SCHEDULE: '0 */30 * * * *'
      'AzureWebJobs.coldStartProbe.Disabled': string(!probeEnabled)
      EXE_URL: 'https://${treatment.outputs.hostname}/api/hello'
      BASELINE_URL: 'https://${baseline.outputs.hostname}/api/hello'
      EXE_FUNCTION_KEY: '@Microsoft.KeyVault(VaultName=${vault.name};SecretName=exe-function-key)'
      BASELINE_FUNCTION_KEY: '@Microsoft.KeyVault(VaultName=${vault.name};SecretName=baseline-function-key)'
      // Keep the deployed two-target probe working until the new app and key are ready.
      NODE_OTEL_URL: nodeOtelProbeEnabled ? 'https://${nodeOtel.outputs.hostname}/api/hello' : ''
      NODE_OTEL_FUNCTION_KEY: nodeOtelProbeEnabled ? '@Microsoft.KeyVault(VaultName=${vault.name};SecretName=node-otel-function-key)' : ''
    }
  }
}

resource probeSecrets 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, 'id-otel-coldstart-probe-86a4', 'secrets-user')
  scope: vault
  properties: {
    principalId: probe.outputs.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

output apps object = {
  treatment: { name: 'otel-coldstart-exe-86a4', hostname: treatment.outputs.hostname }
  baseline: { name: 'otel-coldstart-baseline-86a4', hostname: baseline.outputs.hostname }
  nodeOtel: { name: 'otel-coldstart-node-86a4', hostname: nodeOtel.outputs.hostname }
  probe: { name: 'otel-coldstart-probe-86a4', hostname: probe.outputs.hostname }
}
output keyVaultName string = vault.name
output applicationInsightsName string = insights.name
