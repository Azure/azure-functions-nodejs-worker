using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace Azure.Functions.NodeJs.Tests.E2E
{
    public static class FixtureHelpers
    {
        public static Process GetFuncHostProcess(bool enableAuth = false)
        {
            var funcProcess = new Process();
            var rootDir = Path.GetFullPath(@"..\..\..\..\..\..\..");

            funcProcess.StartInfo.UseShellExecute = false;
            funcProcess.StartInfo.CreateNoWindow = true;
            funcProcess.StartInfo.WorkingDirectory = Path.Combine(rootDir, @"test\end-to-end\testFunctionApp");
            funcProcess.StartInfo.FileName = Path.Combine(rootDir, @"Azure.Functions.Cli\func.exe");
            funcProcess.StartInfo.ArgumentList.Add("start");
            if (enableAuth)
            {
                funcProcess.StartInfo.ArgumentList.Add("--enableAuth");
            }

            return funcProcess;
        }

        public static void KillExistingFuncHosts()
        {
            foreach (var func in Process.GetProcessesByName("func"))
            {
                func.Kill();
            }
        }
    }
}
