' Arranca el agente de impresión de Datta sin ventana y deja el registro en agent.log.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
cmd = "cmd /c """"" & dir & "\node.exe"" ""datta-print-agent.mjs"" >> ""agent.log"" 2>&1"""
sh.Run cmd, 0, False
