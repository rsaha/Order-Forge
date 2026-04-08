import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  Check,
  X,
  Truck,
  Loader2,
} from "lucide-react";

interface TransportRate {
  id: string;
  carrierId: string;
  location: string;
  rate: string | null;
  minRate: string | null;
  maxRate: string | null;
  tat: string | null;
  rateNote: string | null;
}

interface TransportCarrier {
  id: string;
  name: string;
  type: string;
  notes: string | null;
  isActive: boolean;
  rates: TransportRate[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

function formatINR(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "-";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(Number(n));
}

export default function TransportFlyout({ open, onClose }: Props) {
  const { toast } = useToast();
  const [expandedCarrier, setExpandedCarrier] = useState<string | null>(null);
  const [editingCarrierId, setEditingCarrierId] = useState<string | null>(null);
  const [editingCarrierData, setEditingCarrierData] = useState<Partial<TransportCarrier>>({});
  const [addingCarrier, setAddingCarrier] = useState(false);
  const [newCarrier, setNewCarrier] = useState({ name: "", type: "flat_per_location", notes: "" });
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [editingRateData, setEditingRateData] = useState<Partial<TransportRate>>({});
  const [addingRateForCarrier, setAddingRateForCarrier] = useState<string | null>(null);
  const [newRate, setNewRate] = useState({ location: "", rate: "", minRate: "", maxRate: "", tat: "", rateNote: "" });
  const [deleteCarrierId, setDeleteCarrierId] = useState<string | null>(null);
  const [deleteRateId, setDeleteRateId] = useState<string | null>(null);

  const { data: carriers = [], isLoading } = useQuery<TransportCarrier[]>({
    queryKey: ["/api/transport/carriers"],
    enabled: open,
    staleTime: 60000,
  });

  const createCarrierMutation = useMutation({
    mutationFn: (data: { name: string; type: string; notes: string; isActive: boolean }) =>
      apiRequest("POST", "/api/transport/carriers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/carriers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transport/predict"] });
      toast({ title: "Carrier added" });
      setAddingCarrier(false);
      setNewCarrier({ name: "", type: "flat_per_location", notes: "" });
    },
    onError: (e: Error) => toast({ title: "Failed to add carrier", description: e.message, variant: "destructive" }),
  });

  const updateCarrierMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TransportCarrier> }) =>
      apiRequest("PATCH", `/api/transport/carriers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/carriers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transport/predict"] });
      toast({ title: "Carrier updated" });
      setEditingCarrierId(null);
    },
    onError: (e: Error) => toast({ title: "Failed to update carrier", description: e.message, variant: "destructive" }),
  });

  const deleteCarrierMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/transport/carriers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/carriers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transport/predict"] });
      toast({ title: "Carrier deleted" });
      setDeleteCarrierId(null);
    },
    onError: (e: Error) => toast({ title: "Failed to delete carrier", description: e.message, variant: "destructive" }),
  });

  const createRateMutation = useMutation({
    mutationFn: (data: Partial<TransportRate> & { carrierId: string }) =>
      apiRequest("POST", "/api/transport/rates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/carriers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transport/predict"] });
      toast({ title: "Rate added" });
      setAddingRateForCarrier(null);
      setNewRate({ location: "", rate: "", minRate: "", maxRate: "", tat: "", rateNote: "" });
    },
    onError: (e: Error) => toast({ title: "Failed to add rate", description: e.message, variant: "destructive" }),
  });

  const updateRateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TransportRate> }) =>
      apiRequest("PATCH", `/api/transport/rates/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/carriers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transport/predict"] });
      toast({ title: "Rate updated" });
      setEditingRateId(null);
    },
    onError: (e: Error) => toast({ title: "Failed to update rate", description: e.message, variant: "destructive" }),
  });

  const deleteRateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/transport/rates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/carriers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transport/predict"] });
      toast({ title: "Rate deleted" });
      setDeleteRateId(null);
    },
    onError: (e: Error) => toast({ title: "Failed to delete rate", description: e.message, variant: "destructive" }),
  });

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0">
          <SheetHeader className="px-6 py-4 border-b flex-shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Manage Transport Carriers
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 px-6 py-4">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-4">
                {/* Add new carrier form */}
                {addingCarrier ? (
                  <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                    <p className="font-medium text-sm">New Carrier</p>
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input value={newCarrier.name} onChange={e => setNewCarrier(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Bapi da Toto" data-testid="input-new-carrier-name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={newCarrier.type} onValueChange={v => setNewCarrier(p => ({ ...p, type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="flat_per_location">Flat Per Location</SelectItem>
                          <SelectItem value="per_parcel">Per Parcel (Zone-based)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea value={newCarrier.notes} onChange={e => setNewCarrier(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes..." />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={!newCarrier.name || createCarrierMutation.isPending} onClick={() => createCarrierMutation.mutate({ ...newCarrier, isActive: true })} data-testid="button-save-new-carrier">
                        {createCarrierMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddingCarrier(false)}><X className="w-3 h-3 mr-1" />Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setAddingCarrier(true)} className="gap-1" data-testid="button-add-carrier">
                    <Plus className="w-3 h-3" /> Add Carrier
                  </Button>
                )}

                {/* Existing carriers */}
                {carriers.map(carrier => (
                  <Collapsible
                    key={carrier.id}
                    open={expandedCarrier === carrier.id}
                    onOpenChange={v => setExpandedCarrier(v ? carrier.id : null)}
                  >
                    <div className="border rounded-lg overflow-hidden">
                      {/* Carrier header */}
                      <div className="flex items-center gap-2 p-3 bg-muted/30">
                        <CollapsibleTrigger className="flex-1 flex items-center gap-2 text-left">
                          <ChevronDown className={`w-4 h-4 transition-transform ${expandedCarrier === carrier.id ? "rotate-180" : ""}`} />
                          {editingCarrierId === carrier.id ? (
                            <div className="flex-1 grid grid-cols-2 gap-2" onClick={e => e.stopPropagation()}>
                              <Input value={editingCarrierData.name ?? carrier.name} onChange={e => setEditingCarrierData(p => ({ ...p, name: e.target.value }))} className="h-7 text-sm" />
                              <Select value={editingCarrierData.type ?? carrier.type} onValueChange={v => setEditingCarrierData(p => ({ ...p, type: v }))}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="flat_per_location">Flat Per Location</SelectItem>
                                  <SelectItem value="per_parcel">Per Parcel</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-1">
                              <span className="font-medium text-sm">{carrier.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {carrier.type === "flat_per_location" ? "Flat" : "Per Parcel"}
                              </Badge>
                              {!carrier.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                              <span className="text-xs text-muted-foreground ml-1">{carrier.rates.length} rates</span>
                            </div>
                          )}
                        </CollapsibleTrigger>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          {editingCarrierId === carrier.id ? (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={updateCarrierMutation.isPending} onClick={() => updateCarrierMutation.mutate({ id: carrier.id, data: editingCarrierData })}>
                                <Check className="w-3 h-3 text-green-600" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingCarrierId(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingCarrierId(carrier.id); setEditingCarrierData({ name: carrier.name, type: carrier.type, notes: carrier.notes ?? "", isActive: carrier.isActive }); }}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteCarrierId(carrier.id)}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant={carrier.isActive ? "secondary" : "outline"} className="h-7 text-xs px-2" onClick={() => updateCarrierMutation.mutate({ id: carrier.id, data: { isActive: !carrier.isActive } })}>
                                {carrier.isActive ? "Active" : "Inactive"}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Carrier details + rates */}
                      <CollapsibleContent>
                        <div className="p-3 border-t space-y-3">
                          {editingCarrierId === carrier.id && (
                            <div className="space-y-2">
                              <Label className="text-xs">Notes</Label>
                              <Textarea value={editingCarrierData.notes ?? carrier.notes ?? ""} onChange={e => setEditingCarrierData(p => ({ ...p, notes: e.target.value }))} rows={2} className="text-sm" />
                            </div>
                          )}
                          {carrier.notes && editingCarrierId !== carrier.id && (
                            <p className="text-xs text-muted-foreground">{carrier.notes}</p>
                          )}

                          {/* Rates table */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Rate Entries</p>
                              <Button size="sm" variant="outline" className="h-6 text-xs gap-1" onClick={() => { setAddingRateForCarrier(carrier.id); setNewRate({ location: "", rate: "", minRate: "", maxRate: "", tat: "", rateNote: "" }); }}>
                                <Plus className="w-3 h-3" /> Add Rate
                              </Button>
                            </div>

                            {addingRateForCarrier === carrier.id && (
                              <div className="border rounded p-2 space-y-2 mb-2 bg-muted/20">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs">Location / Zone</Label>
                                    <Input className="h-7 text-xs mt-1" value={newRate.location} onChange={e => setNewRate(p => ({ ...p, location: e.target.value }))} placeholder="e.g. KOLKATA" />
                                  </div>
                                  {carrier.type === "flat_per_location" ? (
                                    <div>
                                      <Label className="text-xs">Rate (₹)</Label>
                                      <Input className="h-7 text-xs mt-1" type="number" value={newRate.rate} onChange={e => setNewRate(p => ({ ...p, rate: e.target.value }))} placeholder="e.g. 500" />
                                    </div>
                                  ) : (
                                    <>
                                      <div>
                                        <Label className="text-xs">Min Rate (₹)</Label>
                                        <Input className="h-7 text-xs mt-1" type="number" value={newRate.minRate} onChange={e => setNewRate(p => ({ ...p, minRate: e.target.value }))} placeholder="e.g. 130" />
                                      </div>
                                    </>
                                  )}
                                </div>
                                {carrier.type === "per_parcel" && (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <Label className="text-xs">Max Rate (₹)</Label>
                                      <Input className="h-7 text-xs mt-1" type="number" value={newRate.maxRate} onChange={e => setNewRate(p => ({ ...p, maxRate: e.target.value }))} placeholder="e.g. 170" />
                                    </div>
                                    <div>
                                      <Label className="text-xs">TAT</Label>
                                      <Input className="h-7 text-xs mt-1" value={newRate.tat} onChange={e => setNewRate(p => ({ ...p, tat: e.target.value }))} placeholder="e.g. 48 HRS" />
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <Label className="text-xs">Note</Label>
                                  <Input className="h-7 text-xs mt-1" value={newRate.rateNote} onChange={e => setNewRate(p => ({ ...p, rateNote: e.target.value }))} placeholder="Optional note" />
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" className="h-7 text-xs" disabled={!newRate.location || createRateMutation.isPending} onClick={() => createRateMutation.mutate({ carrierId: carrier.id, ...newRate, rate: newRate.rate || null, minRate: newRate.minRate || null, maxRate: newRate.maxRate || null, tat: newRate.tat || null, rateNote: newRate.rateNote || null })}>
                                    {createRateMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}Save
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingRateForCarrier(null)}><X className="w-3 h-3 mr-1" />Cancel</Button>
                                </div>
                              </div>
                            )}

                            <div className="divide-y border rounded text-xs">
                              {carrier.rates.length === 0 && (
                                <p className="p-2 text-center text-muted-foreground">No rates yet</p>
                              )}
                              {carrier.rates.map(rate => (
                                <div key={rate.id} className="flex items-center gap-2 p-2">
                                  {editingRateId === rate.id ? (
                                    <div className="flex-1 grid grid-cols-3 gap-1">
                                      <Input className="h-6 text-xs col-span-2" value={editingRateData.location ?? rate.location} onChange={e => setEditingRateData(p => ({ ...p, location: e.target.value }))} />
                                      {carrier.type === "flat_per_location" ? (
                                        <Input className="h-6 text-xs" type="number" value={editingRateData.rate ?? rate.rate ?? ""} onChange={e => setEditingRateData(p => ({ ...p, rate: e.target.value }))} placeholder="₹" />
                                      ) : (
                                        <div className="flex gap-1">
                                          <Input className="h-6 text-xs" type="number" value={editingRateData.minRate ?? rate.minRate ?? ""} onChange={e => setEditingRateData(p => ({ ...p, minRate: e.target.value }))} placeholder="Min" />
                                          <Input className="h-6 text-xs" type="number" value={editingRateData.maxRate ?? rate.maxRate ?? ""} onChange={e => setEditingRateData(p => ({ ...p, maxRate: e.target.value }))} placeholder="Max" />
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex-1 flex items-center gap-2">
                                      <span className="font-medium flex-1">{rate.location}</span>
                                      {rate.rate ? (
                                        <span className="text-green-700 dark:text-green-400 font-semibold">{formatINR(rate.rate)}</span>
                                      ) : (
                                        <span className="text-muted-foreground">{formatINR(rate.minRate)}–{formatINR(rate.maxRate)}</span>
                                      )}
                                      {rate.tat && <Badge variant="outline" className="text-xs">{rate.tat}</Badge>}
                                    </div>
                                  )}
                                  <div className="flex gap-1 shrink-0">
                                    {editingRateId === rate.id ? (
                                      <>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={updateRateMutation.isPending} onClick={() => updateRateMutation.mutate({ id: rate.id, data: editingRateData })}>
                                          <Check className="w-3 h-3 text-green-600" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingRateId(null)}>
                                          <X className="w-3 h-3" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingRateId(rate.id); setEditingRateData({ location: rate.location, rate: rate.rate ?? "", minRate: rate.minRate ?? "", maxRate: rate.maxRate ?? "", tat: rate.tat ?? "", rateNote: rate.rateNote ?? "" }); }}>
                                          <Pencil className="w-3 h-3" />
                                        </Button>
                                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setDeleteRateId(rate.id)}>
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Delete carrier confirmation */}
      <AlertDialog open={!!deleteCarrierId} onOpenChange={v => !v && setDeleteCarrierId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Carrier?</AlertDialogTitle>
            <AlertDialogDescription>This will delete the carrier and all its rate entries. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteCarrierId && deleteCarrierMutation.mutate(deleteCarrierId)}>
              {deleteCarrierMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete rate confirmation */}
      <AlertDialog open={!!deleteRateId} onOpenChange={v => !v && setDeleteRateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rate Entry?</AlertDialogTitle>
            <AlertDialogDescription>This rate entry will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteRateId && deleteRateMutation.mutate(deleteRateId)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
