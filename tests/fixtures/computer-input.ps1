# Synthetic editor owned by the native-input tests. Nothing leaves this process.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
$form = [System.Windows.Markup.XamlReader]::Parse(@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        Title="Computer Cat input fixture" Width="640" Height="650"
        ShowInTaskbar="False" WindowStartupLocation="CenterScreen">
  <StackPanel Margin="12">
    <TextBlock Text="Draft a note to Robin about Friday's review." />
    <TextBox Name="Recipient" AutomationProperties.Name="Recipient" Text="robin@example.com" Height="30" />
    <TextBox Name="Subject" AutomationProperties.Name="Subject" Height="30" />
    <TextBox Name="Body" AutomationProperties.Name="Message body" AcceptsReturn="True" TextWrapping="Wrap" Height="130" />
    <PasswordBox Name="Password" AutomationProperties.Name="Secret fixture" Height="25" />
    <TextBox AutomationProperties.Name="Read only" Text="Must remain unchanged" IsReadOnly="True" Height="25" />
    <Button Name="Save" Content="Save draft" Height="25" />
    <Button Name="Send" Content="Send message" Height="25" />
    <TextBlock Name="Status" Text="Unsent" />
    <ScrollViewer Name="Scroller" AutomationProperties.Name="Notes" Height="100" VerticalScrollBarVisibility="Auto">
      <StackPanel><TextBlock Text="First note" Height="100" /><TextBlock Text="Last note" Height="100" /></StackPanel>
    </ScrollViewer>
  </StackPanel>
</Window>
'@)
$body = $form.FindName('Body')
$subject = $form.FindName('Subject')
$status = $form.FindName('Status')
$form.FindName('Password').Password = 'never-expose-this-fixture'
$form.FindName('Save').Add_Click({ $status.Text = 'Saved, unsent' })
$form.FindName('Send').Add_Click({ $status.Text = 'Sent' })
Add-Type -TypeDefinition @'
using System;
using System.Collections.Concurrent;
using System.Threading;
public static class InputFixture {
  static readonly ConcurrentQueue<string> Commands = new ConcurrentQueue<string>();
  public static void Start() {
    var thread = new Thread(() => { string line; while ((line = Console.ReadLine()) != null) Commands.Enqueue(line); Commands.Enqueue("quit"); });
    thread.IsBackground = true; thread.Start();
  }
  public static string Next() { string line; return Commands.TryDequeue(out line) ? line : null; }
}
'@
[InputFixture]::Start()
$clock = [Diagnostics.Stopwatch]::StartNew()
$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(25)
$timer.Add_Tick({
  if ($clock.ElapsedMilliseconds -gt 180000) { $form.Close(); return }
  $command = [InputFixture]::Next()
  if ($command -eq 'quit') { $form.Close(); return }
  if ($command -eq 'move') { $form.Left += 20; [Console]::Out.WriteLine('moved') }
  if ($command -eq 'edit') { $body.Text = 'User changed this'; [Console]::Out.WriteLine('edited') }
  if ($command -eq 'focus-body') { [void]$form.Activate(); [void]$body.Focus(); $body.CaretIndex = $body.Text.Length; [Console]::Out.WriteLine('focused') }
  if ($command -eq 'status') {
    [Console]::Out.WriteLine((@{ recipient = $form.FindName('Recipient').Text; subject = $subject.Text; body = $body.Text; status = $status.Text } | ConvertTo-Json -Compress))
  }
  [Console]::Out.Flush()
})
$form.Add_ContentRendered({
  [void]$body.Focus()
  $interop = New-Object System.Windows.Interop.WindowInteropHelper($form)
  [Console]::Out.WriteLine("ready:$($interop.Handle.ToInt64())")
  [Console]::Out.Flush()
  $timer.Start()
})
try { [void]$form.ShowDialog() }
finally { $timer.Stop(); $form.Close() }
