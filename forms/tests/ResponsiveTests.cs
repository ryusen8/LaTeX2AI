// SPDX-License-Identifier: MIT
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using L2A.UTIL;

internal static class ResponsiveTests
{
    [STAThread]
    public static int Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--wait") {
            File.WriteAllText(args[1], Process.GetCurrentProcess().Id.ToString());
            for (;;) { Console.WriteLine(new string('x', 4096)); Thread.Sleep(10); }
        }
        try {
            var input = typeof(L2A.FORMS.Item).GetField("textbox", BindingFlags.NonPublic | BindingFlags.Instance);
            if (input.FieldType != typeof(TextBox)) throw new Exception("Paragraph paste still uses RichEdit/OLE.");
            using (var cancel = new CancellationTokenSource()) {
                cancel.Cancel();
                try { EditableParagraph.Prepare("Text $x$", 90, 11, cancel.Token, null); throw new Exception("Pre-cancelled job ran."); }
                catch (OperationCanceledException) { }
            }
            string folder = Path.Combine(Path.GetTempPath(), "l2a-cancel-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(folder);
            string started = Path.Combine(folder, "started.txt");
            using (var cancel = new CancellationTokenSource()) {
                var thread = new Thread(() => {
                    for (int i = 0; i < 100 && !File.Exists(started); i++) Thread.Sleep(50);
                    cancel.Cancel();
                });
                thread.Start();
                var watch = Stopwatch.StartNew();
                try {
                    typeof(EditableParagraph).GetMethod("Run", BindingFlags.NonPublic | BindingFlags.Static).Invoke(null,
                        new object[] { Assembly.GetExecutingAssembly().Location, "--wait \"" + started + "\"", folder, "test.log", cancel.Token });
                    throw new Exception("Cancelled compiler did not stop.");
                } catch (TargetInvocationException error) {
                    if (!(error.InnerException is OperationCanceledException)) throw;
                }
                thread.Join();
                if (watch.Elapsed.TotalSeconds > 8 || !File.Exists(started)) throw new Exception("Active compiler cancellation failed.");
                int childId = Int32.Parse(File.ReadAllText(started));
                try {
                    using (var child = Process.GetProcessById(childId))
                        if (!child.WaitForExit(3000)) throw new Exception("Compiler left running after cancellation.");
                } catch (ArgumentException) { }
            }
            Console.WriteLine("PASS plain text input, pre-cancellation and active compiler termination");
            return 0;
        } catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
