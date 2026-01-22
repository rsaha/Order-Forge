import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ArrowLeft, Plus, Pencil, Trash2, Loader2, Megaphone, AlertTriangle, Info, AlertCircle, Calendar
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Announcement, BrandRecord } from "@shared/schema";

type AnnouncementPriority = "info" | "warning" | "urgent";

interface AnnouncementForm {
  title: string;
  message: string;
  priority: AnnouncementPriority;
  targetBrands: string;
  expiresAt: string;
  isActive: boolean;
}

const defaultForm: AnnouncementForm = {
  title: "",
  message: "",
  priority: "info",
  targetBrands: "all",
  expiresAt: "",
  isActive: true,
};

const priorityConfig = {
  info: { icon: Info, label: "Info", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  warning: { icon: AlertTriangle, label: "Warning", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  urgent: { icon: AlertCircle, label: "Urgent", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

export default function AnnouncementsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [announcementToDelete, setAnnouncementToDelete] = useState<Announcement | null>(null);
  const [form, setForm] = useState<AnnouncementForm>(defaultForm);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);

  const isAdmin = user?.isAdmin === true || user?.role === "Admin";

  const { data: announcements = [], isLoading } = useQuery<Announcement[]>({
    queryKey: ["/api/admin/announcements"],
    enabled: isAdmin,
  });

  const { data: brands = [] } = useQuery<BrandRecord[]>({
    queryKey: ["/api/brands"],
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: async (data: AnnouncementForm) => {
      const payload = {
        ...data,
        targetBrands: data.targetBrands === "all" ? "all" : JSON.stringify(selectedBrands),
        expiresAt: data.expiresAt || null,
      };
      return apiRequest("POST", "/api/admin/announcements", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      setIsAddDialogOpen(false);
      setForm(defaultForm);
      setSelectedBrands([]);
      toast({ title: "Announcement created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create announcement", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AnnouncementForm }) => {
      const payload = {
        ...data,
        targetBrands: data.targetBrands === "all" ? "all" : JSON.stringify(selectedBrands),
        expiresAt: data.expiresAt || null,
      };
      return apiRequest("PATCH", `/api/admin/announcements/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      setEditingAnnouncement(null);
      setForm(defaultForm);
      setSelectedBrands([]);
      toast({ title: "Announcement updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update announcement", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/announcements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements"] });
      setAnnouncementToDelete(null);
      toast({ title: "Announcement deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete announcement", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    let targetBrandsValue = "all";
    let brandsArray: string[] = [];
    if (announcement.targetBrands !== "all") {
      try {
        brandsArray = JSON.parse(announcement.targetBrands);
        targetBrandsValue = "specific";
      } catch {
        targetBrandsValue = "all";
      }
    }
    setSelectedBrands(brandsArray);
    setForm({
      title: announcement.title,
      message: announcement.message,
      priority: announcement.priority as AnnouncementPriority,
      targetBrands: targetBrandsValue,
      expiresAt: announcement.expiresAt ? new Date(announcement.expiresAt).toISOString().split('T')[0] : "",
      isActive: announcement.isActive,
    });
  };

  const handleSave = () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast({ title: "Title and message are required", variant: "destructive" });
      return;
    }
    if (editingAnnouncement) {
      updateMutation.mutate({ id: editingAnnouncement.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleOpenAdd = () => {
    setForm(defaultForm);
    setSelectedBrands([]);
    setIsAddDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsAddDialogOpen(false);
    setEditingAnnouncement(null);
    setForm(defaultForm);
    setSelectedBrands([]);
  };

  const toggleBrand = (brandName: string) => {
    setSelectedBrands(prev => 
      prev.includes(brandName) 
        ? prev.filter(b => b !== brandName)
        : [...prev, brandName]
    );
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "No expiry";
    return new Date(date).toLocaleDateString();
  };

  const getTargetBrandsDisplay = (targetBrands: string) => {
    if (targetBrands === "all") return "All users";
    try {
      const brands = JSON.parse(targetBrands);
      return brands.join(", ");
    } catch {
      return targetBrands;
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  const isDialogOpen = isAddDialogOpen || !!editingAnnouncement;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background">
        <div className="flex items-center justify-between p-4">
          <Header 
            cartItemCount={0}
            onCartClick={() => {}}
            isAdmin={isAdmin}
            showTabs={false}
          />
        </div>
      </header>

      <main className="p-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Announcement Management</h1>
            <p className="text-muted-foreground text-sm">
              Create and manage announcements for users
            </p>
          </div>
          <Button onClick={handleOpenAdd} data-testid="button-add-announcement">
            <Plus className="w-4 h-4 mr-2" />
            Add Announcement
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : announcements.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Megaphone className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No announcements yet.</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={handleOpenAdd}
              >
                Create your first announcement
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {announcements.map((announcement) => {
              const PriorityIcon = priorityConfig[announcement.priority as AnnouncementPriority]?.icon || Info;
              const priorityLabel = priorityConfig[announcement.priority as AnnouncementPriority]?.label || "Info";
              const priorityColor = priorityConfig[announcement.priority as AnnouncementPriority]?.color || priorityConfig.info.color;
              const isExpired = announcement.expiresAt && new Date(announcement.expiresAt) < new Date();
              
              return (
                <Card key={announcement.id} data-testid={`card-announcement-${announcement.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <PriorityIcon className="w-4 h-4 flex-shrink-0" />
                          <span className="font-medium truncate" data-testid={`text-announcement-title-${announcement.id}`}>
                            {announcement.title}
                          </span>
                          <Badge className={priorityColor}>
                            {priorityLabel}
                          </Badge>
                          <Badge variant={announcement.isActive && !isExpired ? "default" : "secondary"}>
                            {isExpired ? "Expired" : announcement.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {announcement.message}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <span>Target: {getTargetBrandsDisplay(announcement.targetBrands)}</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(announcement.expiresAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(announcement)}
                          data-testid={`button-edit-announcement-${announcement.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setAnnouncementToDelete(announcement)}
                          data-testid={`button-delete-announcement-${announcement.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={isDialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAnnouncement ? "Edit Announcement" : "Create Announcement"}</DialogTitle>
            <DialogDescription>
              {editingAnnouncement ? "Update the announcement details." : "Create a new announcement for users."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Announcement title"
                data-testid="input-announcement-title"
              />
            </div>
            <div>
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                value={form.message}
                onChange={(e) => setForm(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Announcement message..."
                rows={3}
                data-testid="input-announcement-message"
              />
            </div>
            <div>
              <Label>Priority</Label>
              <Select 
                value={form.priority} 
                onValueChange={(value) => setForm(prev => ({ ...prev, priority: value as AnnouncementPriority }))}
              >
                <SelectTrigger data-testid="select-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info (Blue)</SelectItem>
                  <SelectItem value="warning">Warning (Amber)</SelectItem>
                  <SelectItem value="urgent">Urgent (Red)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Audience</Label>
              <Select 
                value={form.targetBrands} 
                onValueChange={(value) => setForm(prev => ({ ...prev, targetBrands: value }))}
              >
                <SelectTrigger data-testid="select-target-brands">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="specific">Specific Brands</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.targetBrands === "specific" && (
              <div>
                <Label>Select Brands</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {brands.map((brand) => (
                    <Badge
                      key={brand.id}
                      variant={selectedBrands.includes(brand.name) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleBrand(brand.name)}
                      data-testid={`badge-brand-${brand.id}`}
                    >
                      {brand.name}
                    </Badge>
                  ))}
                </div>
                {selectedBrands.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Select at least one brand
                  </p>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="expires">Expires At (optional)</Label>
              <Input
                id="expires"
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm(prev => ({ ...prev, expiresAt: e.target.value }))}
                data-testid="input-expires-at"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="active">Active</Label>
              <Switch
                id="active"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, isActive: checked }))}
                data-testid="switch-announcement-active"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={!form.title.trim() || !form.message.trim() || createMutation.isPending || updateMutation.isPending || (form.targetBrands === "specific" && selectedBrands.length === 0)}
              data-testid="button-save-announcement"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingAnnouncement ? "Save Changes" : "Create Announcement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!announcementToDelete} onOpenChange={(open) => !open && setAnnouncementToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{announcementToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => announcementToDelete && deleteMutation.mutate(announcementToDelete.id)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete-announcement"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
