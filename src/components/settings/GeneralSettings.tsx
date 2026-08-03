import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { Save } from "lucide-react";

export function GeneralSettings() {
  const { profile, role } = useAuth();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
        <CardDescription>Update your personal information</CardDescription>
      </CardHeader>
      <CardContent className="form-section">
        <div className="form-row">
          <div className="form-field">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" defaultValue={profile?.full_name || ""} placeholder="Your name" />
          </div>
          <div className="form-field">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" defaultValue={profile?.email || ""} disabled />
          </div>
          <div className="form-field">
            <Label htmlFor="extension">Phone Extension</Label>
            <Input id="extension" defaultValue={profile?.phone_extension || ""} placeholder="e.g. 101" />
          </div>
          <div className="form-field">
            <Label htmlFor="role">Role</Label>
            <Input id="role" value={role?.replace("_", " ").toUpperCase() || "AGENT"} disabled />
          </div>
        </div>
        <div className="form-actions">
          <Button className="gap-2 min-w-[140px]">
            <Save className="h-4 w-4" aria-hidden />
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
