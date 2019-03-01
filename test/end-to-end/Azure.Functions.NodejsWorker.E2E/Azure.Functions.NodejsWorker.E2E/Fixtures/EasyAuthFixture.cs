// Copyright (c) .NET Foundation. All rights reserved.
// Licensed under the MIT License. See License.txt in the project root for license information.

using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using System.Threading;
using Xunit;

namespace Azure.Functions.NodeJs.Tests.E2E
{
    public class EasyAuthFixture : IDisposable
    {
        private readonly ILogger _logger;
        private readonly IDictionary<string, string> _variables = new Dictionary<string, string> { { "WEBSITE_AUTH_ENABLED", "TRUE" } };
        private Process _funcProcess;
        private bool _disposed;

        public EasyAuthFixture()
        {
            //initialize logging
    #pragma warning disable CS0618 // Type or member is obsolete
            ILoggerFactory loggerFactory = new LoggerFactory().AddConsole();
    #pragma warning restore CS0618 // Type or member is obsolete
            _logger = loggerFactory.CreateLogger<EasyAuthFixture>();
            
            // start host via CLI if testing locally
            if (Constants.FunctionsHostUrl.Contains("localhost"))
            {
                // kill existing func processes
                _logger.LogInformation("Shutting down any running functions hosts..");
                FixtureHelpers.KillExistingFuncHosts();

                _funcProcess = FixtureHelpers.GetFuncHostProcess(true);
                SetEnvironmentVariables();

                // start functions process
                _logger.LogInformation($"Starting functions host for {Constants.FunctionAppCollectionName}..");
                _funcProcess.Start();

                Thread.Sleep(TimeSpan.FromSeconds(30));
            }
        }

        private void SetEnvironmentVariables()
        {
            if (_funcProcess != null)
            {
                foreach (var item in _variables)
                {
                    if (_funcProcess.StartInfo.EnvironmentVariables.ContainsKey(item.Key))
                    {
                        _funcProcess.StartInfo.EnvironmentVariables[item.Key] = item.Value;
                    }
                    else
                    {
                        _funcProcess.StartInfo.EnvironmentVariables.Add(item.Key, item.Value);
                    }
                }
            }
        }

        protected virtual void Dispose(bool disposing)
        {
            if (!_disposed)
            {
                if (disposing)
                {
                    _logger.LogInformation("FunctionAppFixture disposing.");

                    if (_funcProcess != null)
                    {
                        _logger.LogInformation($"Shutting down functions host for {Constants.FunctionAppCollectionName}");
                        _funcProcess.Dispose();

                        _logger.LogInformation($"Clearing environment variables.");
                    }
                }

                _disposed = true;
            }
        }

        public void Dispose()
        {
            Dispose(true);
        }
    }

    [CollectionDefinition(Constants.EasyAuthCollectionName, DisableParallelization = true)]
    public class EasyAuthCollection : ICollectionFixture<EasyAuthFixture>
    {
        // This class has no code, and is never created. Its purpose is simply
        // to be the place to apply [CollectionDefinition] and all the
        // ICollectionFixture<> interfaces.
    }
}
