targetScope = 'subscription'

param location string = 'westus3'
param resourceGroupName string = 'rg-otel-coldstart-86a4'
param environmentName string = 'otel-coldstart-86a4'
param sessionId string = '86a4775b-dcab-43cb-8258-fa919590f8b5'
param deployedBy string
param deployerObjectId string
param createdAt string
param probeEnabled bool = false
param nodeOtelProbeEnabled bool = false

var tags = {
  'app-onboard-skill': 'true'
  'app-onboard-session-id': sessionId
  'created-at': createdAt
  environment: environmentName
  'deployed-by': deployedBy
  experiment: 'otel-coldstart'
}

resource group 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module resources './resources.bicep' = {
  name: 'otel-coldstart-resources'
  scope: group
  params: {
    location: location
    tags: tags
    deployerObjectId: deployerObjectId
    probeEnabled: probeEnabled
    nodeOtelProbeEnabled: nodeOtelProbeEnabled
  }
}

output apps object = resources.outputs.apps
output keyVaultName string = resources.outputs.keyVaultName
output applicationInsightsName string = resources.outputs.applicationInsightsName
