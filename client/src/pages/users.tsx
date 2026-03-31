import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Shield, ShieldCheck, User as UserIcon, Loader2, Trash2,
  Pencil, X, Check, Plus, Mail, Phone, Key, Search, GitMerge, ChevronRight, AlertTriangle, CheckCircle2
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
import type { User, UserRole, BrandRecord } from "@shared/schema";
import { USER_ROLES } from "@shared/schema";

interface UserWithBrands extends User {
  brandAccess: string[];
  deliveryCompanyAccess?: string[];
  partyAccess?: string[];
}

const DELIVERY_COMPANIES = ["Guided", "Xmaple", "Elmeric"];

const ROLE_TABS = ["All", "Admin", "BrandAdmin", "User", "Customer"] as const;

export default function UsersPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("All");
  const [selectedUser, setSelectedUser] = useState<UserWithBrands | null>(null);
  const [sheetMode, setSheetMode] = useState<"view" | "add">("view");
  const [userToDelete, setUserToDelete] = useState<UserWithBrands | null>(null);

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingFirstName, setEditingFirstName] = useState("");
  const [editingLastName, setEditingLastName] = useState("");
  const [editingBrands, setEditingBrands] = useState<string[]>([]);
  const [editingDeliveryCompanies, setEditingDeliveryCompanies] = useState<string[]>([]);
  const [editingPartyName, setEditingPartyName] = useState("");
  const [editingPartyAccess, setEditingPartyAccess] = useState<string[]>([]);
  const [partyAccessInput, setPartyAccessInput] = useState("");
  const [editingLinkedSalesUser, setEditingLinkedSalesUser] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");

  const [mergeStep, setMergeStep] = useState<"select" | "preview" | "success" | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeSearchQuery, setMergeSearchQuery] = useState("");
  const [mergeResult, setMergeResult] = useState<{ ordersTransferred: number; brandsAdded: string[]; deliveryCompaniesAdded: string[]; partiesAdded: string[]; customersTransferred: number; sessionsCleared: number } | null>(null);

  const [newUser, setNewUser] = useState({
    email: "",
    phone: "",
    initialPassword: "",
    firstName: "",
    lastName: "",
    partyName: "",
    role: "User" as "Admin" | "BrandAdmin" | "User" | "Customer",
    brands: [] as string[],
    deliveryCompanies: [] as string[],
    linkedSalesUserId: "",
  });

  const isAdmin = user?.isAdmin === true;

  const { data: users = [], isLoading } = useQuery<UserWithBrands[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAdmin,
  });

  const { data: brandRecords = [] } = useQuery<BrandRecord[]>({
    queryKey: ["/api/brands"],
  });

  const { data: partyNames = [] } = useQuery<string[]>({
    queryKey: ["/api/admin/party-names"],
    enabled: isAdmin,
  });

  const { data: salesUsers = [] } = useQuery<{ id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null }[]>({
    queryKey: ["/api/admin/sales-users"],
    enabled: isAdmin,
  });

  const { data: mergePreview, isLoading: mergePreviewLoading } = useQuery({
    queryKey: ["/api/admin/users/merge-preview", selectedUser?.id, mergeTargetId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/merge-preview?sourceId=${selectedUser?.id}&targetId=${mergeTargetId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load preview");
      return res.json();
    },
    enabled: mergeStep === "preview" && !!selectedUser?.id && !!mergeTargetId,
  });

  useEffect(() => {
    if (selectedUser) {
      const updated = users.find(u => u.id === selectedUser.id);
      if (updated && updated !== selectedUser) {
        setSelectedUser(updated);
      }
    }
  }, [users]);

  const filteredUsers = useMemo(() => {
    let list = users;
    if (activeTab !== "All") {
      list = list.filter(u => (u.role || "User") === activeTab);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(u =>
        (u.firstName || "").toLowerCase().includes(q) ||
        (u.lastName || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.phone || "").toLowerCase().includes(q) ||
        (u.partyName || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [users, activeTab, searchQuery]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { All: users.length, Admin: 0, BrandAdmin: 0, User: 0, Customer: 0 };
    users.forEach(u => {
      const role = u.role || "User";
      if (counts[role] !== undefined) counts[role]++;
    });
    return counts;
  }, [users]);

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: async ({ userId, firstName, lastName }: { userId: string; firstName: string; lastName: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/name`, { firstName, lastName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingField(null);
      toast({ title: "Name updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update name", description: error.message, variant: "destructive" });
    },
  });

  const updateBrandsMutation = useMutation({
    mutationFn: async ({ userId, brands }: { userId: string; brands: string[] }) => {
      return apiRequest("PUT", `/api/users/${userId}/brand-access`, { brands });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingField(null);
      toast({ title: "Brand access updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update brand access", description: error.message, variant: "destructive" });
    },
  });

  const updateDeliveryCompaniesMutation = useMutation({
    mutationFn: async ({ userId, deliveryCompanies }: { userId: string; deliveryCompanies: string[] }) => {
      return apiRequest("PUT", `/api/users/${userId}/delivery-company-access`, { deliveryCompanies });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingField(null);
      toast({ title: "Delivery company access updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update delivery companies", description: error.message, variant: "destructive" });
    },
  });

  const updatePartyNameMutation = useMutation({
    mutationFn: async ({ userId, partyName }: { userId: string; partyName: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/party-name`, { partyName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingField(null);
      toast({ title: "Party name updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update party name", description: error.message, variant: "destructive" });
    },
  });

  const updatePartyAccessMutation = useMutation({
    mutationFn: async ({ userId, partyNames }: { userId: string; partyNames: string[] }) => {
      return apiRequest("PUT", `/api/users/${userId}/party-access`, { partyNames });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingField(null);
      setPartyAccessInput("");
      toast({ title: "Party access updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update party access", description: error.message, variant: "destructive" });
    },
  });

  const updateLinkedSalesUserMutation = useMutation({
    mutationFn: async ({ userId, linkedSalesUserId }: { userId: string; linkedSalesUserId: string | null }) => {
      return apiRequest("PATCH", `/api/admin/customers/${userId}/linked-sales-user`, { linkedSalesUserId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingField(null);
      toast({ title: "Linked sales user updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update linked sales user", description: error.message, variant: "destructive" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setUserToDelete(null);
      setSelectedUser(null);
      toast({ title: "User deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete user", description: error.message, variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof newUser) => {
      return apiRequest("POST", "/api/admin/customers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSheetMode("view");
      setSelectedUser(null);
      setNewUser({
        email: "", phone: "", initialPassword: "", firstName: "", lastName: "",
        partyName: "", role: "User", brands: [], deliveryCompanies: [], linkedSalesUserId: "",
      });
      toast({ title: "User created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create user", description: error.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/password`, { password });
    },
    onSuccess: () => {
      setEditingField(null);
      setNewPassword("");
      toast({ title: "Password updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset password", description: error.message, variant: "destructive" });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ sourceUserId, targetUserId }: { sourceUserId: string; targetUserId: string }) => {
      const res = await apiRequest("POST", "/api/admin/users/merge", { sourceUserId, targetUserId });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setMergeResult(data);
      setMergeStep("success");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to merge users", description: error.message, variant: "destructive" });
    },
  });

  const getDisplayName = (u: UserWithBrands | User | { firstName: string | null; lastName: string | null; email?: string | null; phone?: string | null }) => {
    if (u.firstName || u.lastName) {
      return `${u.firstName || ""} ${u.lastName || ""}`.trim();
    }
    if ('email' in u && u.email) return u.email.split("@")[0];
    return "Unnamed";
  };

  const getRoleIcon = (role: string | null) => {
    switch (role) {
      case "Admin": return <ShieldCheck className="w-4 h-4 text-destructive" />;
      case "BrandAdmin": return <Shield className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />;
      case "Customer": return <UserIcon className="w-4 h-4 text-green-600 dark:text-green-500" />;
      default: return <UserIcon className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getRoleBadgeVariant = (role: string | null): "destructive" | "secondary" | "default" | "outline" => {
    switch (role) {
      case "Admin": return "destructive";
      case "BrandAdmin": return "secondary";
      case "Customer": return "default";
      default: return "outline";
    }
  };

  const openUserSheet = (u: UserWithBrands) => {
    setSelectedUser(u);
    setSheetMode("view");
    setEditingField(null);
    setMergeStep(null);
    setMergeTargetId("");
    setMergeSearchQuery("");
  };

  const openAddUserSheet = () => {
    setSelectedUser(null);
    setSheetMode("add");
    setEditingField(null);
    setNewUser({
      email: "", phone: "", initialPassword: "", firstName: "", lastName: "",
      partyName: "", role: "User", brands: [], deliveryCompanies: [], linkedSalesUserId: "",
    });
  };

  const closeSheet = () => {
    setSelectedUser(null);
    setSheetMode("view");
    setEditingField(null);
    setMergeStep(null);
    setMergeTargetId("");
    setMergeSearchQuery("");
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-6 text-center">
          <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">Only administrators can access this page.</p>
          <Button onClick={() => navigate("/")} data-testid="button-go-home">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Home
          </Button>
        </Card>
      </div>
    );
  }

  const sheetOpen = sheetMode === "add" || !!selectedUser;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between gap-4 px-4 h-16">
          <Header cartItemCount={0} onCartClick={() => {}} isAdmin={isAdmin} />
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b bg-card">
          <div className="flex items-center gap-2 px-4 py-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold" data-testid="text-page-title">Users</h1>
            <div className="ml-auto">
              <Button size="sm" onClick={openAddUserSheet} data-testid="button-add-user">
                <Plus className="w-4 h-4 mr-1" />
                Add User
              </Button>
            </div>
          </div>

          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone, or party..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-users"
              />
            </div>
          </div>

          <div className="flex gap-1 px-4 pb-2 overflow-x-auto">
            {ROLE_TABS.map(tab => (
              <Button
                key={tab}
                variant={activeTab === tab ? "default" : "ghost"}
                size="sm"
                onClick={() => setActiveTab(tab)}
                className="text-xs whitespace-nowrap"
                data-testid={`button-tab-${tab.toLowerCase()}`}
              >
                {tab === "BrandAdmin" ? "Brand Admin" : tab}
                <Badge variant="outline" className="ml-1.5 text-[10px] px-1.5 py-0">
                  {roleCounts[tab]}
                </Badge>
              </Button>
            ))}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-1 max-w-4xl mx-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-muted-foreground" data-testid="text-no-users">
                  {searchQuery ? "No users match your search" : "No users found"}
                </p>
              </Card>
            ) : (
              filteredUsers.map(u => (
                <div
                  key={u.id}
                  onClick={() => openUserSheet(u)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
                  data-testid={`row-user-${u.id}`}
                >
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage src={u.profileImageUrl || undefined} alt={u.firstName || "User"} />
                    <AvatarFallback className="text-xs">
                      {(u.firstName?.[0] || u.email?.[0] || "U").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate" data-testid={`text-user-name-${u.id}`}>
                        {getDisplayName(u)}
                      </span>
                      <Badge variant={getRoleBadgeVariant(u.role)} className="text-[10px] px-1.5 py-0 flex-shrink-0">
                        {u.role || "User"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {u.email && (
                        <span className="truncate max-w-[180px]" data-testid={`text-user-email-${u.id}`}>{u.email}</span>
                      )}
                      {u.phone && (
                        <span data-testid={`text-user-phone-${u.id}`}>{u.phone}</span>
                      )}
                      {u.partyName && (
                        <span className="truncate max-w-[120px]">{u.partyName}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {sheetMode === "add" ? (
            <>
              <SheetHeader>
                <SheetTitle>Add New User</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label>Role *</Label>
                  <Select value={newUser.role} onValueChange={(value) => setNewUser(prev => ({ ...prev, role: value as typeof newUser.role }))}>
                    <SelectTrigger data-testid="select-new-user-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="User">User (Sales Rep)</SelectItem>
                      <SelectItem value="BrandAdmin">Brand Admin</SelectItem>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Customer">Customer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">Provide either email (for Google login) or phone number (for password login)</p>
                <div className="space-y-2">
                  <Label>Email {newUser.phone.trim() ? "(optional)" : ""}</Label>
                  <Input type="email" placeholder="user@example.com" value={newUser.email} onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))} data-testid="input-new-user-email" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Phone {newUser.email.trim() ? "(optional)" : ""}</Label>
                    <Input type="tel" placeholder="9876543210" value={newUser.phone} onChange={(e) => setNewUser(prev => ({ ...prev, phone: e.target.value }))} data-testid="input-new-user-phone" />
                  </div>
                  <div className="space-y-2">
                    <Label>Password {newUser.phone.trim() ? "*" : "(for phone login)"}</Label>
                    <Input type="text" placeholder="Min 6 chars" value={newUser.initialPassword} onChange={(e) => setNewUser(prev => ({ ...prev, initialPassword: e.target.value }))} data-testid="input-new-user-password" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input placeholder="First name" value={newUser.firstName} onChange={(e) => setNewUser(prev => ({ ...prev, firstName: e.target.value }))} data-testid="input-new-user-first-name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input placeholder="Last name" value={newUser.lastName} onChange={(e) => setNewUser(prev => ({ ...prev, lastName: e.target.value }))} data-testid="input-new-user-last-name" />
                  </div>
                </div>
                {newUser.role === "Customer" && (
                  <>
                    <div className="space-y-2">
                      <Label>Party Name *</Label>
                      <Input placeholder="Business or party name" value={newUser.partyName} onChange={(e) => setNewUser(prev => ({ ...prev, partyName: e.target.value }))} data-testid="input-new-user-party-name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Linked Sales User</Label>
                      <Select value={newUser.linkedSalesUserId || "none"} onValueChange={(value) => setNewUser(prev => ({ ...prev, linkedSalesUserId: value === "none" ? "" : value }))}>
                        <SelectTrigger data-testid="select-new-user-linked-sales-user"><SelectValue placeholder="Select sales user" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No linked sales user</SelectItem>
                          {salesUsers.map(su => (
                            <SelectItem key={su.id} value={su.id}>
                              {su.firstName || su.lastName ? `${su.firstName || ''} ${su.lastName || ''}`.trim() : su.phone || su.email || su.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div className="space-y-2">
                  <Label>Allowed Brands</Label>
                  <div className="flex flex-wrap gap-2 p-2 border rounded-md">
                    {brandRecords.filter(b => b.isActive).map(brand => (
                      <div key={brand.id} className="flex items-center gap-1">
                        <Checkbox
                          id={`new-brand-${brand.id}`}
                          checked={newUser.brands.includes(brand.name)}
                          onCheckedChange={(checked) => setNewUser(prev => ({ ...prev, brands: checked ? [...prev.brands, brand.name] : prev.brands.filter(b => b !== brand.name) }))}
                        />
                        <Label htmlFor={`new-brand-${brand.id}`} className="text-sm cursor-pointer">{brand.name}</Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Delivery Companies</Label>
                  <div className="flex flex-wrap gap-2 p-2 border rounded-md">
                    {DELIVERY_COMPANIES.map(company => (
                      <div key={company} className="flex items-center gap-1">
                        <Checkbox
                          id={`new-dc-${company}`}
                          checked={newUser.deliveryCompanies.includes(company)}
                          onCheckedChange={(checked) => setNewUser(prev => ({ ...prev, deliveryCompanies: checked ? [...prev.deliveryCompanies, company] : prev.deliveryCompanies.filter(c => c !== company) }))}
                        />
                        <Label htmlFor={`new-dc-${company}`} className="text-sm cursor-pointer">{company}</Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={closeSheet} className="flex-1" data-testid="button-cancel-add-user">Cancel</Button>
                  <Button
                    onClick={() => createUserMutation.mutate(newUser)}
                    disabled={(!newUser.email.trim() && !newUser.phone.trim()) || (newUser.phone.trim() && newUser.initialPassword.length < 6) || (newUser.role === "Customer" && !newUser.partyName.trim()) || createUserMutation.isPending}
                    className="flex-1"
                    data-testid="button-save-user"
                  >
                    {createUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    Create
                  </Button>
                </div>
              </div>
            </>
          ) : selectedUser && !mergeStep ? (
            <>
              <SheetHeader>
                <SheetTitle>User Details</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={selectedUser.profileImageUrl || undefined} />
                    <AvatarFallback>{(selectedUser.firstName?.[0] || selectedUser.email?.[0] || "U").toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    {editingField === "name" ? (
                      <div className="flex items-center gap-1">
                        <Input value={editingFirstName} onChange={(e) => setEditingFirstName(e.target.value)} placeholder="First" className="text-sm h-8 w-24" data-testid={`input-firstname-${selectedUser.id}`} />
                        <Input value={editingLastName} onChange={(e) => setEditingLastName(e.target.value)} placeholder="Last" className="text-sm h-8 w-24" data-testid={`input-lastname-${selectedUser.id}`} />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateNameMutation.mutate({ userId: selectedUser.id, firstName: editingFirstName.trim(), lastName: editingLastName.trim() })} disabled={updateNameMutation.isPending} data-testid={`button-save-name-${selectedUser.id}`}>
                          {updateNameMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingField(null)} data-testid={`button-cancel-name-${selectedUser.id}`}><X className="w-3 h-3" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="font-semibold">{getDisplayName(selectedUser)}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 opacity-60" onClick={() => { setEditingField("name"); setEditingFirstName(selectedUser.firstName || ""); setEditingLastName(selectedUser.lastName || ""); }} data-testid={`button-edit-name-${selectedUser.id}`}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                    <Badge variant={getRoleBadgeVariant(selectedUser.role)} className="text-xs mt-1">{selectedUser.role || "User"}</Badge>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Identity</h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span data-testid={`text-user-email-${selectedUser.id}`}>{selectedUser.email || "No email"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span data-testid={`text-user-phone-${selectedUser.id}`}>{selectedUser.phone || "No phone"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Role</Label>
                    <Select value={selectedUser.role || "User"} onValueChange={(value) => { updateRoleMutation.mutate({ userId: selectedUser.id, role: value }); }}>
                      <SelectTrigger className="w-32 h-8 text-xs" data-testid={`select-role-${selectedUser.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {USER_ROLES.map(role => (
                          <SelectItem key={role} value={role}>
                            <div className="flex items-center gap-1">{getRoleIcon(role)}<span className="text-xs">{role}</span></div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedUser.phone && (
                    <div>
                      {editingField === "password" ? (
                        <div className="flex items-center gap-1">
                          <Input type="password" placeholder="Min 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-8 text-sm" data-testid="input-new-password" />
                          <Button size="sm" variant="ghost" onClick={() => { resetPasswordMutation.mutate({ userId: selectedUser.id, password: newPassword }); }} disabled={newPassword.length < 6 || resetPasswordMutation.isPending} data-testid="button-save-password">
                            {resetPasswordMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingField(null); setNewPassword(""); }} data-testid="button-cancel-password-reset"><X className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => { setEditingField("password"); setNewPassword(""); }} data-testid={`button-set-password-${selectedUser.id}`}>
                          <Key className="w-3 h-3 mr-1" /> Set Password
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Access Permissions</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Brands</Label>
                      {editingField !== "brands" && (
                        <Button size="sm" variant="ghost" className="h-6 opacity-60" onClick={() => { setEditingField("brands"); setEditingBrands([...selectedUser.brandAccess]); }} data-testid={`button-edit-brands-${selectedUser.id}`}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    {editingField === "brands" ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {brandRecords.map(brand => (
                            <Badge key={brand.id} variant={editingBrands.includes(brand.name) ? "default" : "outline"} className="text-xs cursor-pointer" onClick={() => setEditingBrands(prev => prev.includes(brand.name) ? prev.filter(b => b !== brand.name) : [...prev, brand.name])} data-testid={`badge-brand-${selectedUser.id}-${brand.name}`}>
                              {brand.name}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => updateBrandsMutation.mutate({ userId: selectedUser.id, brands: editingBrands })} disabled={updateBrandsMutation.isPending} data-testid={`button-save-brands-${selectedUser.id}`}>
                            {updateBrandsMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />} Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingField(null)} data-testid={`button-cancel-brands-${selectedUser.id}`}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {selectedUser.brandAccess.length > 0 ? selectedUser.brandAccess.map(brand => (
                          <Badge key={brand} variant="secondary" className="text-xs">{brand}</Badge>
                        )) : <span className="text-xs text-muted-foreground">None</span>}
                      </div>
                    )}
                  </div>

                  {(selectedUser.role === "Customer") && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Delivery Companies</Label>
                        {editingField !== "deliveryCompanies" && (
                          <Button size="sm" variant="ghost" className="h-6 opacity-60" onClick={() => { setEditingField("deliveryCompanies"); setEditingDeliveryCompanies([...(selectedUser.deliveryCompanyAccess || [])]); }} data-testid={`button-edit-delivery-${selectedUser.id}`}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                      {editingField === "deliveryCompanies" ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1">
                            {DELIVERY_COMPANIES.map(company => (
                              <Badge key={company} variant={editingDeliveryCompanies.includes(company) ? "default" : "outline"} className="text-xs cursor-pointer" onClick={() => setEditingDeliveryCompanies(prev => prev.includes(company) ? prev.filter(c => c !== company) : [...prev, company])} data-testid={`badge-delivery-${selectedUser.id}-${company.toLowerCase()}`}>
                                {company}
                              </Badge>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" onClick={() => updateDeliveryCompaniesMutation.mutate({ userId: selectedUser.id, deliveryCompanies: editingDeliveryCompanies })} disabled={updateDeliveryCompaniesMutation.isPending} data-testid={`button-save-delivery-${selectedUser.id}`}>
                              {updateDeliveryCompaniesMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />} Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingField(null)} data-testid={`button-cancel-delivery-${selectedUser.id}`}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(selectedUser.deliveryCompanyAccess && selectedUser.deliveryCompanyAccess.length > 0) ? selectedUser.deliveryCompanyAccess.map(c => (
                            <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                          )) : <span className="text-xs text-muted-foreground">None</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground">Relationships</h3>

                  {selectedUser.role === "Customer" && (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Party Name</Label>
                          {editingField !== "partyName" && (
                            <Button size="sm" variant="ghost" className="h-6 opacity-60" onClick={() => { setEditingField("partyName"); setEditingPartyName(selectedUser.partyName || ""); }} data-testid={`button-edit-party-name-${selectedUser.id}`}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                        {editingField === "partyName" ? (
                          <div className="flex items-center gap-1">
                            <Input value={editingPartyName} onChange={(e) => setEditingPartyName(e.target.value)} placeholder="Party name" className="text-sm h-8" data-testid={`input-party-name-${selectedUser.id}`} />
                            <Button size="sm" variant="ghost" onClick={() => updatePartyNameMutation.mutate({ userId: selectedUser.id, partyName: editingPartyName.trim() })} disabled={updatePartyNameMutation.isPending} data-testid={`button-save-party-name-${selectedUser.id}`}>
                              {updatePartyNameMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingField(null)} data-testid={`button-cancel-party-name-${selectedUser.id}`}><X className="w-3 h-3" /></Button>
                          </div>
                        ) : (
                          <span className="text-sm" data-testid={`text-party-name-${selectedUser.id}`}>{selectedUser.partyName || <span className="text-muted-foreground">Not set</span>}</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Sales User</Label>
                          {editingField !== "linkedSalesUser" && (
                            <Button size="sm" variant="ghost" className="h-6 opacity-60" onClick={() => { setEditingField("linkedSalesUser"); setEditingLinkedSalesUser(selectedUser.linkedSalesUserId || ""); }} data-testid={`button-edit-linked-sales-user-${selectedUser.id}`}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                        {editingField === "linkedSalesUser" ? (
                          <div className="flex items-center gap-1">
                            <Select value={editingLinkedSalesUser || "none"} onValueChange={(v) => setEditingLinkedSalesUser(v === "none" ? "" : v)}>
                              <SelectTrigger className="h-8 text-xs" data-testid={`select-linked-sales-user-${selectedUser.id}`}><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No linked sales user</SelectItem>
                                {salesUsers.map(su => (
                                  <SelectItem key={su.id} value={su.id}>
                                    {su.firstName || su.lastName ? `${su.firstName || ''} ${su.lastName || ''}`.trim() : su.phone || su.email || su.id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button size="sm" variant="ghost" onClick={() => updateLinkedSalesUserMutation.mutate({ userId: selectedUser.id, linkedSalesUserId: editingLinkedSalesUser || null })} disabled={updateLinkedSalesUserMutation.isPending} data-testid={`button-save-linked-sales-user-${selectedUser.id}`}>
                              {updateLinkedSalesUserMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingField(null)} data-testid={`button-cancel-linked-sales-user-${selectedUser.id}`}><X className="w-3 h-3" /></Button>
                          </div>
                        ) : (
                          <span className="text-sm" data-testid={`text-linked-sales-user-${selectedUser.id}`}>
                            {(() => {
                              const linked = salesUsers.find(su => su.id === selectedUser.linkedSalesUserId);
                              if (linked) return linked.firstName || linked.lastName ? `${linked.firstName || ''} ${linked.lastName || ''}`.trim() : linked.phone || linked.email || linked.id;
                              return <span className="text-muted-foreground">Not linked</span>;
                            })()}
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {selectedUser.role === "User" && (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Linked Parties</Label>
                          {editingField !== "partyAccess" && (
                            <Button size="sm" variant="ghost" className="h-6 opacity-60" onClick={() => { setEditingField("partyAccess"); setEditingPartyAccess([...(selectedUser.partyAccess || [])]); setPartyAccessInput(""); }} data-testid={`button-edit-party-access-${selectedUser.id}`}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                        {editingField === "partyAccess" ? (
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-1">
                              {editingPartyAccess.map(party => (
                                <Badge key={party} variant="default" className="text-xs cursor-pointer" onClick={() => setEditingPartyAccess(prev => prev.filter(p => p !== party))} data-testid={`badge-party-access-${selectedUser.id}-${party.replace(/\s+/g, '-')}`}>
                                  {party} <X className="w-3 h-3 ml-1" />
                                </Badge>
                              ))}
                            </div>
                            <div className="flex items-center gap-1">
                              <Input value={partyAccessInput} onChange={(e) => setPartyAccessInput(e.target.value)} placeholder="Add party..." className="text-sm h-8" list={`party-sugg-${selectedUser.id}`} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const t = partyAccessInput.trim(); if (t && !editingPartyAccess.includes(t)) setEditingPartyAccess(prev => [...prev, t]); setPartyAccessInput(""); } }} data-testid={`input-party-access-${selectedUser.id}`} />
                              <datalist id={`party-sugg-${selectedUser.id}`}>
                                {partyNames.filter(p => !editingPartyAccess.includes(p)).map(p => <option key={p} value={p} />)}
                              </datalist>
                              <Button size="sm" variant="ghost" disabled={!partyAccessInput.trim()} onClick={() => { const t = partyAccessInput.trim(); if (t && !editingPartyAccess.includes(t)) setEditingPartyAccess(prev => [...prev, t]); setPartyAccessInput(""); }} data-testid={`button-add-party-${selectedUser.id}`}>
                                <Plus className="w-3 h-3" />
                              </Button>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" onClick={() => updatePartyAccessMutation.mutate({ userId: selectedUser.id, partyNames: editingPartyAccess })} disabled={updatePartyAccessMutation.isPending} data-testid={`button-save-party-access-${selectedUser.id}`}>
                                {updatePartyAccessMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 mr-1" />} Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingField(null); setPartyAccessInput(""); }} data-testid={`button-cancel-party-access-${selectedUser.id}`}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(selectedUser.partyAccess && selectedUser.partyAccess.length > 0) ? selectedUser.partyAccess.map(party => (
                              <Badge key={party} variant="secondary" className="text-xs">{party}</Badge>
                            )) : <span className="text-xs text-muted-foreground">None</span>}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm">Linked Customers</Label>
                        <div className="flex flex-wrap gap-1">
                          {(() => {
                            const linkedCustomers = users.filter(cu => cu.role === "Customer" && cu.linkedSalesUserId === selectedUser.id);
                            if (linkedCustomers.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
                            return linkedCustomers.map(cu => (
                              <Badge key={cu.id} variant="secondary" className="text-xs" data-testid={`badge-linked-customer-${selectedUser.id}-${cu.id}`}>
                                {cu.firstName || cu.lastName ? `${cu.firstName || ''} ${cu.lastName || ''}`.trim() : cu.partyName || cu.phone || cu.email || cu.id}
                              </Badge>
                            ));
                          })()}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <Separator />

                <div className="space-y-2 pb-4">
                  <h3 className="text-sm font-medium text-muted-foreground">Actions</h3>
                  {selectedUser.id !== user?.id && (
                    <div className="flex flex-col gap-2">
                      <Button variant="outline" size="sm" onClick={() => setMergeStep("select")} data-testid={`button-merge-${selectedUser.id}`}>
                        <GitMerge className="w-4 h-4 mr-2" /> Merge into another user
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setUserToDelete(selectedUser)} data-testid={`button-delete-user-${selectedUser.id}`}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete user
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : selectedUser && mergeStep === "select" ? (
            <>
              <SheetHeader>
                <SheetTitle>Merge User</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Merging (will be removed)</p>
                  <div className="flex items-center gap-2">
                    <Avatar className="w-7 h-7">
                      <AvatarFallback className="text-xs">{(selectedUser.firstName?.[0] || selectedUser.email?.[0] || "U").toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                      <span className="font-medium text-sm">{getDisplayName(selectedUser)}</span>
                      <p className="text-xs text-muted-foreground">{selectedUser.email || selectedUser.phone}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Select target user (will be kept)</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Search users..." value={mergeSearchQuery} onChange={(e) => setMergeSearchQuery(e.target.value)} className="pl-9" data-testid="input-merge-search" />
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-1">
                  {users
                    .filter(u => u.id !== selectedUser.id)
                    .filter(u => {
                      if (!mergeSearchQuery.trim()) return true;
                      const q = mergeSearchQuery.toLowerCase();
                      return (u.firstName || "").toLowerCase().includes(q) || (u.lastName || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q) || (u.phone || "").toLowerCase().includes(q);
                    })
                    .map(u => (
                      <div key={u.id} onClick={() => setMergeTargetId(u.id)} className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors ${mergeTargetId === u.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50'}`} data-testid={`merge-target-${u.id}`}>
                        <Avatar className="w-7 h-7">
                          <AvatarFallback className="text-xs">{(u.firstName?.[0] || u.email?.[0] || "U").toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{getDisplayName(u)}</span>
                          <span className="text-xs text-muted-foreground">{u.email || u.phone}</span>
                        </div>
                        <Badge variant={getRoleBadgeVariant(u.role)} className="text-[10px]">{u.role}</Badge>
                      </div>
                    ))
                  }
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setMergeStep(null); setMergeTargetId(""); setMergeSearchQuery(""); }} className="flex-1" data-testid="button-merge-back-select">Back</Button>
                  <Button onClick={() => setMergeStep("preview")} disabled={!mergeTargetId} className="flex-1" data-testid="button-merge-preview">Next</Button>
                </div>
              </div>
            </>
          ) : selectedUser && mergeStep === "preview" ? (
            <>
              <SheetHeader>
                <SheetTitle>Confirm Merge</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                {mergePreviewLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : mergePreview ? (
                  <>
                    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">This action cannot be undone</p>
                        <p className="text-xs text-muted-foreground mt-1">All data from the source user will be transferred to the target user, and the source account will be permanently deleted.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 border border-red-200 dark:border-red-900">
                        <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">Source (removing)</p>
                        <p className="text-sm font-medium">{getDisplayName(mergePreview.source.user)}</p>
                        <p className="text-xs text-muted-foreground">{mergePreview.source.user.email || mergePreview.source.user.phone}</p>
                        <div className="mt-2 space-y-1 text-xs">
                          <p>{mergePreview.source.orderCount} orders</p>
                          <p>{mergePreview.source.brandAccess.length} brands</p>
                          <p>{mergePreview.source.deliveryCompanyAccess.length} delivery cos.</p>
                          <p>{mergePreview.source.partyAccess.length} parties</p>
                          <p>{mergePreview.source.linkedCustomerCount} linked customers</p>
                        </div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 border border-green-200 dark:border-green-900">
                        <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-2">Target (keeping)</p>
                        <p className="text-sm font-medium">{getDisplayName(mergePreview.target.user)}</p>
                        <p className="text-xs text-muted-foreground">{mergePreview.target.user.email || mergePreview.target.user.phone}</p>
                        <div className="mt-2 space-y-1 text-xs">
                          <p>{mergePreview.target.orderCount} orders</p>
                          <p>{mergePreview.target.brandAccess.length} brands</p>
                          <p>{mergePreview.target.deliveryCompanyAccess.length} delivery cos.</p>
                          <p>{mergePreview.target.partyAccess.length} parties</p>
                          <p>{mergePreview.target.linkedCustomerCount} linked customers</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                      <p className="text-xs font-medium">What will happen:</p>
                      <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
                        {mergePreview.source.orderCount > 0 && <li>{mergePreview.source.orderCount} orders will be transferred</li>}
                        {mergePreview.source.brandAccess.filter((b: string) => !mergePreview.target.brandAccess.includes(b)).length > 0 && (
                          <li>Brand access added: {mergePreview.source.brandAccess.filter((b: string) => !mergePreview.target.brandAccess.includes(b)).join(", ")}</li>
                        )}
                        {mergePreview.source.deliveryCompanyAccess.filter((dc: string) => !mergePreview.target.deliveryCompanyAccess.includes(dc)).length > 0 && (
                          <li>Delivery company access added: {mergePreview.source.deliveryCompanyAccess.filter((dc: string) => !mergePreview.target.deliveryCompanyAccess.includes(dc)).join(", ")}</li>
                        )}
                        {mergePreview.source.partyAccess.filter((p: string) => !mergePreview.target.partyAccess.includes(p)).length > 0 && (
                          <li>Party access added: {mergePreview.source.partyAccess.filter((p: string) => !mergePreview.target.partyAccess.includes(p)).join(", ")}</li>
                        )}
                        {mergePreview.source.linkedCustomerCount > 0 && <li>{mergePreview.source.linkedCustomerCount} linked customers will be reassigned</li>}
                        <li>Source account will be permanently deleted</li>
                      </ul>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setMergeStep("select")} className="flex-1" data-testid="button-merge-back-preview">Back</Button>
                      <Button variant="destructive" onClick={() => mergeMutation.mutate({ sourceUserId: selectedUser.id, targetUserId: mergeTargetId })} disabled={mergeMutation.isPending} className="flex-1" data-testid="button-confirm-merge">
                        {mergeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <GitMerge className="w-4 h-4 mr-2" />}
                        Merge Users
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Failed to load preview.</p>
                )}
              </div>
            </>
          ) : mergeStep === "success" && mergeResult ? (
            <>
              <SheetHeader>
                <SheetTitle>Merge Complete</SheetTitle>
                <SheetDescription>The accounts have been successfully merged.</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 mt-4">
                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 border border-green-200 dark:border-green-900">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">Merge Summary</p>
                  </div>
                  <ul className="text-sm space-y-1.5 text-muted-foreground" data-testid="merge-success-summary">
                    {mergeResult.ordersTransferred > 0 && <li>{mergeResult.ordersTransferred} order(s) transferred</li>}
                    {mergeResult.brandsAdded.length > 0 && <li>Brand access added: {mergeResult.brandsAdded.join(", ")}</li>}
                    {mergeResult.deliveryCompaniesAdded.length > 0 && <li>Delivery company access added: {mergeResult.deliveryCompaniesAdded.join(", ")}</li>}
                    {mergeResult.partiesAdded.length > 0 && <li>Party access added: {mergeResult.partiesAdded.join(", ")}</li>}
                    {mergeResult.customersTransferred > 0 && <li>{mergeResult.customersTransferred} linked customer(s) reassigned</li>}
                    {mergeResult.sessionsCleared > 0 && <li>{mergeResult.sessionsCleared} active session(s) cleared</li>}
                    <li>Source account has been deleted</li>
                  </ul>
                </div>
                <Button onClick={() => { setSelectedUser(null); setMergeStep(null); setMergeTargetId(""); setMergeSearchQuery(""); setMergeResult(null); }} className="w-full" data-testid="button-merge-done">
                  Done
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{userToDelete?.firstName || userToDelete?.email || 'this user'}"?
              This will remove their account and all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete">
              {deleteUserMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
