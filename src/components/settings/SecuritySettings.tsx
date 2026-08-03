import { Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function SecuritySettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Security Settings
        </CardTitle>
        <CardDescription>Manage organization security</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="setting-row">
          <div className="space-y-0.5 min-w-0">
            <Label>Two-Factor Authentication</Label>
            <p className="text-sm text-muted-foreground">Require 2FA for all users</p>
          </div>
          <Switch />
        </div>
        <div className="setting-row">
          <div className="space-y-0.5 min-w-0">
            <Label>Session Timeout</Label>
            <p className="text-sm text-muted-foreground">Auto-logout after inactivity</p>
          </div>
          <Switch defaultChecked />
        </div>
        <div className="setting-row">
          <div className="space-y-0.5 min-w-0">
            <Label>Audit Logging</Label>
            <p className="text-sm text-muted-foreground">Track all user actions</p>
          </div>
          <Switch defaultChecked />
        </div>
      </CardContent>
    </Card>
  );
}
