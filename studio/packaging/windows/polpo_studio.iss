; Installer di Polpo Studio per Windows (Inno Setup 6). Compilazione:
;   iscc /DAppVersion=0.1.0 /DSourceDir=..\..\dist\PolpoStudio packaging\windows\polpo_studio.iss
#ifndef AppVersion
  #define AppVersion "0.1.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\dist\PolpoStudio"
#endif

[Setup]
AppId={{7B3C2D6E-5A41-4C8F-9E2B-50D0A1F3C7A9}
AppName=Polpo Studio
AppVersion={#AppVersion}
AppPublisher=Progetto Polpo
DefaultDirName={autopf}\Polpo Studio
DefaultGroupName=Polpo Studio
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputBaseFilename=PolpoStudio-{#AppVersion}-Windows-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\PolpoStudio.exe

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Polpo Studio"; Filename: "{app}\PolpoStudio.exe"
Name: "{group}\{cm:UninstallProgram,Polpo Studio}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Polpo Studio"; Filename: "{app}\PolpoStudio.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\PolpoStudio.exe"; Description: "{cm:LaunchProgram,Polpo Studio}"; Flags: nowait postinstall skipifsilent
