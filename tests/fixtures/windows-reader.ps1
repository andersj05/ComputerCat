# Owned, synthetic UI only. The native reader smoke test never enumerates the desktop.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
$form = [System.Windows.Markup.XamlReader]::Parse(@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Computer Cat accessibility fixture" Width="600" Height="320"
        ShowInTaskbar="False" WindowStartupLocation="CenterScreen">
  <StackPanel Margin="12">
    <TextBox Name="Editor" Height="65" Text="A violet cat studies this example."
             TextWrapping="Wrap" AcceptsReturn="True" />
    <PasswordBox Name="Password" Height="26" Margin="0,12" />
    <TabControl Height="125">
      <TabItem Header="Alpha fixture tab"><TextBlock Text="Alpha page content" /></TabItem>
      <TabItem Header="Beta fixture tab"><TextBlock Text="Beta page content" /></TabItem>
    </TabControl>
  </StackPanel>
</Window>
'@)
$editor = $form.FindName('Editor')
$password = $form.FindName('Password')
$password.Password = 'fixture-password-never-report'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Threading;
public static class FixtureInput {
  private static readonly ConcurrentQueue<string> Commands = new ConcurrentQueue<string>();
  public static void Start() {
    Thread thread = new Thread(() => {
      string line;
      while ((line = Console.ReadLine()) != null) Commands.Enqueue(line);
      Commands.Enqueue("quit");
    });
    thread.IsBackground = true;
    thread.Start();
  }
  public static string Next() {
    string command;
    return Commands.TryDequeue(out command) ? command : null;
  }
}
'@
[FixtureInput]::Start()
$lifetime = [Diagnostics.Stopwatch]::StartNew()
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(50)
$timer.Add_Tick({
  if ($lifetime.ElapsedMilliseconds -ge 20000) { $timer.Stop(); $form.Close(); return }
  $command = [FixtureInput]::Next()
  if ($null -eq $command) { return }
  if ($command -eq 'quit') { $timer.Stop(); $form.Close(); return }
  if ($command -eq 'status') {
    [Console]::Out.WriteLine("status:$($editor.SelectionStart):$($editor.SelectionLength)")
    [Console]::Out.Flush()
  }
  if ($command -eq 'select-spaces') {
    $editor.Text = '  selected code  '
    $editor.Select(0, $editor.Text.Length)
    [Console]::Out.WriteLine('selection-ready')
    [Console]::Out.Flush()
  }
})
$form.Add_ContentRendered({
  [void]$editor.Focus()
  $editor.Select(2, 10)
  $interop = New-Object System.Windows.Interop.WindowInteropHelper($form)
  [Console]::Out.WriteLine("ready:$($interop.Handle.ToInt64())")
  [Console]::Out.Flush()
  $timer.Start()
})
try { [void]$form.ShowDialog() }
finally { $timer.Stop(); $form.Close() }
