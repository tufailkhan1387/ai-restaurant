import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

export function GeneralSettings() {
  const { profile, role } = useAuth();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
        <CardDescription>Update your personal information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input id="fullName" defaultValue={profile?.full_name || ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" defaultValue={profile?.email || ""} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="extension">Phone Extension</Label>
            <Input id="extension" defaultValue={profile?.phone_extension || ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Input id="role" value={role?.replace("_", " ").toUpperCase() || "AGENT"} disabled />
          </div>
        </div>
        <Button className="gradient-primary text-primary-foreground">Save Changes</Button>
      </CardContent>
    </Card>
  );
}
