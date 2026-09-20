# Owned, synthetic UI only. The native reader smoke test never enumerates the desktop.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$PSModuleAutoLoadingPreference = 'None'
Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Xaml
Add-Type -AssemblyName UIAutomationProvider
Add-Type -AssemblyName UIAutomationTypes
Add-Type -ReferencedAssemblies @(
  [System.Windows.Controls.TextBox].Assembly.Location,
  [System.Windows.Automation.Peers.AutomationPeer].Assembly.Location,
  [System.Windows.DependencyObject].Assembly.Location,
  [System.Windows.Markup.IQueryAmbient].Assembly.Location,
  [System.Windows.Automation.Provider.IValueProvider].Assembly.Location,
  [System.Windows.Automation.AutomationIdentifier].Assembly.Location
) -TypeDefinition @'
using System.Windows.Controls;
using System.Windows.Automation.Peers;
public class FixtureDocument : TextBox {
  protected override AutomationPeer OnCreateAutomationPeer() { return new FixtureDocumentPeer(this); }
}
public class FixtureDocumentPeer : TextBoxAutomationPeer {
  public FixtureDocumentPeer(FixtureDocument owner) : base(owner) {}
  protected override AutomationControlType GetAutomationControlTypeCore() { return AutomationControlType.Document; }
}
'@
$form = [System.Windows.Markup.XamlReader]::Parse(@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Computer Cat accessibility fixture" Width="600" Height="430"
        ShowInTaskbar="False" WindowStartupLocation="CenterScreen">
  <StackPanel Name="Contents" Margin="12">
    <TextBox Name="Editor" AutomationProperties.Name="Note editor" Height="65" Text="A violet cat studies this example."
             TextWrapping="Wrap" AcceptsReturn="True" />
    <PasswordBox Name="Password" AutomationProperties.Name="Private password" Height="26" Margin="0,12" />
    <Button Content="Save fixture" IsEnabled="False" Height="24" />
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
$document = New-Object FixtureDocument
$document.Text = 'https://example.com/fixture'
$document.IsReadOnly = $true
$document.Height = 24
[System.Windows.Automation.AutomationProperties]::SetName($document, 'Fixture document')
[void]$form.FindName('Contents').Children.Add($document)
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
  if ($lifetime.ElapsedMilliseconds -ge 60000) { $timer.Stop(); $form.Close(); return }
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
