import { useState, Fragment, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Truck,
  Package,
  Loader2,
  Settings,
  Check,
  ChevronRight,
  ChevronDown,
  MapPin,
  RefreshCw,
  X,
  Zap,
  Download,
} from "lucide-react";
import TransportFlyout from "./TransportFlyout";

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

interface CarrierCost {
  matched: boolean;
  rate: number | null;
  minRate: number | null;
  maxRate: number | null;
  estimatedCost: number | null;
  location: string | null;
}

interface Suggestion {
  carrierId: string;
  carrierName: string;
  reason: string;
  tat: string | null;
}

interface UnassignedGroup {
  partyName: string;
  location: string | null;
  orderCount: number;
  totalCases: number;
  orderIds: string[];
  carrierCosts: Record<string, CarrierCost>;
  suggestion: Suggestion | null;
}

export interface AssignedGroup {
  dispatchBy: string;
  orderCount: number;
  totalCases: number;
  orderIds: string[];
  estimatedCost: number | null;
}

interface PredictData {
  carriers: TransportCarrier[];
  unassigned: UnassignedGroup[];
  assigned: AssignedGroup[];
}

interface OrderSummary {
  id: string;
  partyName: string | null;
  invoiceNumber: string | null;
  brand: string | null;
  actualOrderValue: string | null;
  total: string | null;
  cases: number | null;
  status: string;
  deliveryAddress?: string | null;
}

function formatINR(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "-";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0 }).format(Number(n));
}

export default function TransportPredictionTab({ onDispatchGroup, orders = [] }: { onDispatchGroup: (group: AssignedGroup) => void; orders?: OrderSummary[] }) {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"unassigned" | "assigned">("unassigned");
  const [showFlyout, setShowFlyout] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Assign dialog state
  const [assignGroup, setAssignGroup] = useState<UnassignedGroup | null>(null);
  const [assignCarrier, setAssignCarrier] = useState("");

  // Per-party carrier overrides (partyName -> carrierName) for inline override before assigning
  const [carrierOverrides, setCarrierOverrides] = useState<Record<string, string>>({});
  // Ref to suppress per-group assign toasts during auto-assign-all batch operation
  const isBatchAssigningRef = useRef(false);

  // Unassign confirm state — holds the dispatchBy key of the group pending confirmation
  const [unassignPending, setUnassignPending] = useState<string | null>(null);

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const { data, isLoading, refetch, isFetching } = useQuery<PredictData>({
    queryKey: ["/api/transport/predict"],
    staleTime: 60000,
  });

  const carriers = data?.carriers ?? [];
  const unassigned = data?.unassigned ?? [];
  const assigned = data?.assigned ?? [];

  const assignMutation = useMutation({
    mutationFn: ({ orderIds, dispatchBy }: { orderIds: string[]; dispatchBy: string }) =>
      apiRequest("PATCH", "/api/transport/assign", { orderIds, dispatchBy }),
    onSuccess: (_, vars) => {
      // Skip per-group cache invalidation during batch (handled once at batch end)
      if (!isBatchAssigningRef.current) {
        queryClient.invalidateQueries({ queryKey: ["/api/transport/predict"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
        toast({ title: `Assigned "${vars.dispatchBy}" to ${vars.orderIds.length} order(s)` });
      }
      setAssignGroup(null);
      setAssignCarrier("");
    },
    onError: (e: Error) => {
      if (!isBatchAssigningRef.current) {
        toast({ title: "Failed to assign", description: e.message, variant: "destructive" });
      }
    },
  });

  const unassignMutation = useMutation({
    mutationFn: ({ orderIds }: { orderIds: string[] }) =>
      apiRequest("PATCH", "/api/transport/unassign", { orderIds }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/predict"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({ title: `Unassigned ${vars.orderIds.length} order(s)` });
      setUnassignPending(null);
    },
    onError: (e: Error) => toast({ title: "Failed to unassign", description: e.message, variant: "destructive" }),
  });

  // Auto-assign all: assign each unassigned group to its suggested carrier (or override if set)
  async function handleAutoAssignAll() {
    const groups = unassigned.filter(g => g.suggestion || carrierOverrides[g.partyName]);
    if (groups.length === 0) {
      toast({ title: "Nothing to auto-assign", description: "No suggestions are available for unassigned parties.", variant: "destructive" });
      return;
    }
    isBatchAssigningRef.current = true;
    let successCount = 0;
    let errorCount = 0;
    const successParties: string[] = [];
    for (const group of groups) {
      const carrierName = carrierOverrides[group.partyName] || group.suggestion?.carrierName;
      if (!carrierName) continue;
      await new Promise<void>(resolve => {
        assignMutation.mutate(
          { orderIds: group.orderIds, dispatchBy: carrierName },
          {
            onSuccess: () => { successCount++; successParties.push(group.partyName); resolve(); },
            onError: () => { errorCount++; resolve(); },
          }
        );
      });
    }
    isBatchAssigningRef.current = false;
    queryClient.invalidateQueries({ queryKey: ["/api/transport/predict"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    if (successParties.length > 0) {
      setCarrierOverrides(prev => {
        const next = { ...prev };
        for (const p of successParties) delete next[p];
        return next;
      });
    }
    if (errorCount === 0) {
      toast({ title: `Auto-assigned ${successCount} group(s) to their suggested carriers` });
    } else {
      toast({
        title: `Auto-assign complete with ${errorCount} error(s)`,
        description: `${successCount} group(s) assigned successfully.`,
        variant: errorCount > 0 ? "destructive" : "default",
      });
    }
  }

  // Helper: match partyName against carrier rates (mirrors backend logic)
  function matchCarrierRate(partyName: string, carrierRates: TransportRate[]): TransportRate | null {
    const pnLower = partyName.toLowerCase().trim();
    let best: TransportRate | null = null;
    let bestLen = 0;
    for (const rate of carrierRates) {
      const locLower = rate.location.toLowerCase().trim();
      if (pnLower.includes(locLower) || locLower.includes(pnLower)) {
        if (rate.location.length > bestLen) {
          bestLen = rate.location.length;
          best = rate;
        }
      }
    }
    return best;
  }

  // Compute estimated transport cost for a party with a given carrier.
  // Mirrors backend logic: tries locationText (deliveryAddress) first, falls back to partyName.
  function computeTransportCost(partyName: string, locationText: string | null | undefined, orderCount: number, carrier: TransportCarrier): number | null {
    // Try locationText first, fallback to partyName
    let matched = locationText ? matchCarrierRate(locationText, carrier.rates) : null;
    if (!matched) matched = matchCarrierRate(partyName, carrier.rates);
    if (!matched) return null;
    if (carrier.type === "flat_per_location") {
      return matched.rate ? Number(matched.rate) : null;
    } else {
      const minR = matched.minRate ? Number(matched.minRate) : null;
      return minR !== null ? minR * orderCount : null;
    }
  }

  // Export dispatch sheet for assigned groups
  function handleExportDispatchSheet() {
    if (assigned.length === 0) {
      toast({ title: "Nothing to export", description: "No assigned groups to export." });
      return;
    }

    const wb = XLSX.utils.book_new();
    const rows: (string | number)[][] = [];

    // Header row
    rows.push(["Party Name", "Carrier", "Order References", "Total Cartons", "Est. Transport Cost (INR)", "TAT", "Notes"]);

    for (const group of assigned) {
      const carrier = carriers.find(c => c.name.toLowerCase() === group.dispatchBy.toLowerCase());
      // Use mode (most frequent) TAT across rates as carrier-level TAT for the header
      const tatValues = carrier?.rates?.map(r => r.tat).filter(Boolean) ?? [];
      const tatCounts = new Map<string, number>();
      for (const t of tatValues) tatCounts.set(t!, (tatCounts.get(t!) ?? 0) + 1);
      const carrierTat = tatCounts.size > 0
        ? [...tatCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
        : "-";

      // Carrier header row
      rows.push([`CARRIER: ${group.dispatchBy}`, "", `TAT: ${carrierTat}`, "", "", "", ""]);

      // Order rows for this carrier group
      const groupOrders = orders.filter(o => group.orderIds.includes(o.id));

      // Group by party within the carrier
      const partyMap = new Map<string, OrderSummary[]>();
      for (const o of groupOrders) {
        const pn = o.partyName || "(No Party)";
        if (!partyMap.has(pn)) partyMap.set(pn, []);
        partyMap.get(pn)!.push(o);
      }

      let groupTransportTotal = 0;
      let groupTransportKnown = true;

      for (const [partyName, partyOrders] of partyMap.entries()) {
        const invoiceRefs = partyOrders.map(o => o.invoiceNumber || o.id.slice(0, 8)).join(", ");
        const totalCartons = partyOrders.reduce((s, o) => s + (o.cases ?? 0), 0);
        // Use the first deliveryAddress found for this party (mirrors backend location-first matching)
        const partyLocationText = partyOrders.find(o => o.deliveryAddress)?.deliveryAddress ?? null;
        // Compute transport cost using carrier rate (not order value)
        const transportCost = carrier ? computeTransportCost(partyName, partyLocationText, partyOrders.length, carrier) : null;
        // Derive TAT from the matched rate for this specific party/location
        const partyMatchedRate = carrier
          ? (partyLocationText ? matchCarrierRate(partyLocationText, carrier.rates) : null) ?? matchCarrierRate(partyName, carrier.rates)
          : null;
        const partyTat = partyMatchedRate?.tat ?? carrierTat;
        if (transportCost !== null) {
          groupTransportTotal += transportCost;
        } else {
          groupTransportKnown = false;
        }
        rows.push([
          partyName,
          group.dispatchBy,
          invoiceRefs,
          totalCartons,
          transportCost !== null ? transportCost : "",
          partyTat,
          "",
        ]);
      }

      // Subtotal row — use precomputed estimatedCost from backend if available, else sum computed per-party costs
      const subtotalCartons = groupOrders.reduce((s, o) => s + (o.cases ?? 0), 0);
      const subtotalCost = group.estimatedCost !== null
        ? group.estimatedCost
        : (groupTransportKnown ? groupTransportTotal : "");
      rows.push([
        `Subtotal — ${group.dispatchBy}`,
        "",
        `${group.orderCount} order(s)`,
        subtotalCartons,
        subtotalCost,
        "",
        "",
      ]);

      // Blank separator
      rows.push(["", "", "", "", "", "", ""]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set column widths for A4 landscape
    ws["!cols"] = [
      { wch: 32 }, // Party Name
      { wch: 22 }, // Carrier
      { wch: 30 }, // Order References
      { wch: 14 }, // Total Cartons
      { wch: 18 }, // Estimated Cost
      { wch: 12 }, // TAT
      { wch: 20 }, // Notes
    ];

    // Bold the header row and carrier header rows.
    // Note: SheetJS community edition (CE) supports cell.s only when writing with
    // bookSST/cellStyles options; bold may not render in all environments.
    // Core export data/structure is correct regardless of styling support.
    const boldStyle = { font: { bold: true } };
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let R = range.s.r; R <= range.e.r; R++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: 0 })];
      if (!cell) continue;
      const val = String(cell.v ?? "");
      if (R === 0 || val.startsWith("CARRIER:") || val.startsWith("Subtotal")) {
        for (let C = 0; C <= 6; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (ws[addr]) ws[addr].s = boldStyle;
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, "Dispatch Sheet");
    XLSX.writeFile(wb, `dispatch-sheet-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Export complete", description: "Dispatch sheet downloaded." });
  }

  // Get carrier name options for assign dialog (carrier names + custom input)
  const carrierNames = carriers.map(c => c.name);

  const totalUnassignedOrders = unassigned.reduce((s, g) => s + g.orderCount, 0);
  const totalAssignedOrders = assigned.reduce((s, g) => s + g.orderCount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Transport tab header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setSubTab("unassigned")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${subTab === "unassigned" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="tab-transport-unassigned"
            >
              Unassigned
              {totalUnassignedOrders > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0 min-w-5 h-4">
                  {totalUnassignedOrders}
                </Badge>
              )}
            </button>
            <button
              onClick={() => setSubTab("assigned")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${subTab === "assigned" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="tab-transport-assigned"
            >
              Assigned
              {totalAssignedOrders > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0 min-w-5 h-4">
                  {totalAssignedOrders}
                </Badge>
              )}
            </button>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()} disabled={isFetching} title="Refresh">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {subTab === "assigned" && assigned.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportDispatchSheet} className="gap-1.5" data-testid="button-export-dispatch-sheet">
              <Download className="w-4 h-4" />
              Export Dispatch Sheet
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowFlyout(true)} className="gap-1.5" data-testid="button-manage-transport">
            <Settings className="w-4 h-4" />
            Manage Transport
          </Button>
        </div>
      </div>

      {/* ── Unassigned sub-tab ── */}
      {subTab === "unassigned" && (
        <div className="space-y-3">
          {unassigned.length > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                className="gap-1.5 bg-primary"
                onClick={handleAutoAssignAll}
                disabled={assignMutation.isPending}
                data-testid="button-auto-assign-all"
              >
                {assignMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Auto-assign All
              </Button>
            </div>
          )}
          {unassigned.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">No unassigned invoiced orders</p>
              <p className="text-sm mt-1">All invoiced orders already have a carrier assigned.</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-2 font-medium">Party</th>
                      <th className="text-center p-2 font-medium">Orders</th>
                      <th className="text-center p-2 font-medium">Cartons</th>
                      <th className="text-left p-2 font-medium">Suggested Carrier</th>
                      <th className="text-right p-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {unassigned.map(group => {
                      const suggestion = group.suggestion;
                      const overriddenCarrier = carrierOverrides[group.partyName];
                      const effectiveCarrierName = overriddenCarrier ?? suggestion?.carrierName ?? "";
                      const isManualOverride = !!overriddenCarrier && overriddenCarrier !== suggestion?.carrierName;
                      const effectiveReason = isManualOverride ? "Manual override" : (suggestion?.reason ?? "No suggestion available");

                      return (
                        <tr key={group.partyName} className="hover:bg-muted/30 transition-colors">
                          <td className="p-2">
                            <div className="flex items-start gap-1.5">
                              <MapPin className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <span className="font-medium block max-w-[180px] truncate">{group.partyName}</span>
                                {group.location && (
                                  <span className="text-xs text-muted-foreground block max-w-[180px] truncate" title={group.location}>
                                    {group.location}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <Badge variant="outline">{group.orderCount}</Badge>
                          </td>
                          <td className="p-2 text-center">
                            <span className={group.totalCases === 0 ? "text-muted-foreground" : "font-medium"}>
                              {group.totalCases || "-"}
                            </span>
                          </td>
                          <td className="p-2">
                            <div className="space-y-1 min-w-[180px]">
                              <Select
                                value={effectiveCarrierName}
                                onValueChange={val => {
                                  setCarrierOverrides(prev => ({ ...prev, [group.partyName]: val }));
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs" data-testid={`select-carrier-${group.partyName}`}>
                                  <SelectValue placeholder="No suggestion" />
                                </SelectTrigger>
                                <SelectContent>
                                  {carrierNames.map(n => (
                                    <SelectItem key={n} value={n}>{n}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground leading-tight truncate max-w-[220px]" title={effectiveReason}>
                                {effectiveReason}
                              </p>
                              {!isManualOverride && suggestion?.tat && (
                                <p className="text-xs text-muted-foreground leading-tight font-medium" data-testid={`text-tat-${group.partyName}`}>
                                  TAT: {suggestion.tat}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 h-7 text-xs"
                              onClick={() => {
                                setAssignGroup(group);
                                setAssignCarrier(effectiveCarrierName || (carriers[0]?.name ?? ""));
                              }}
                              data-testid={`button-assign-${group.partyName}`}
                            >
                              <Truck className="w-3 h-3" />
                              Assign
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Assigned sub-tab ── */}
      {subTab === "assigned" && (
        <div>
          {assigned.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">No assigned invoiced orders</p>
              <p className="text-sm mt-1">Assign carriers to invoiced orders using the Unassigned tab.</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-2 font-medium">Carrier / Dispatch By</th>
                      <th className="text-center p-2 font-medium">Orders</th>
                      <th className="text-center p-2 font-medium">Total Cartons</th>
                      <th className="text-right p-2 font-medium">Est. Cost</th>
                      <th className="text-right p-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {assigned.map(group => {
                      const isExpanded = expandedGroups.has(group.dispatchBy);
                      const groupOrders = orders.filter(o => group.orderIds.includes(o.id));
                      return (
                        <Fragment key={group.dispatchBy}>
                          <tr className="hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => toggleGroup(group.dispatchBy)}
                          >
                            <td className="p-2">
                              <div className="flex items-center gap-1.5">
                                <button className="text-muted-foreground hover:text-foreground transition-colors">
                                  {isExpanded
                                    ? <ChevronDown className="w-3.5 h-3.5" />
                                    : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                                <Truck className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                <span className="font-medium">{group.dispatchBy}</span>
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              <Badge variant="outline">{group.orderCount}</Badge>
                            </td>
                            <td className="p-2 text-center">
                              <span className={group.totalCases === 0 ? "text-muted-foreground" : "font-medium"}>
                                {group.totalCases || "-"}
                              </span>
                            </td>
                            <td className="p-2 text-right">
                              {group.estimatedCost !== null ? (
                                <span className="font-semibold text-green-700 dark:text-green-400">
                                  {formatINR(group.estimatedCost)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </td>
                            <td className="p-2 text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                {unassignPending === group.dispatchBy ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1 h-7 text-xs text-muted-foreground"
                                      onClick={() => setUnassignPending(null)}
                                      disabled={unassignMutation.isPending}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="gap-1 h-7 text-xs"
                                      onClick={() => unassignMutation.mutate({ orderIds: group.orderIds })}
                                      disabled={unassignMutation.isPending}
                                      data-testid={`button-unassign-confirm-${group.dispatchBy}`}
                                    >
                                      {unassignMutation.isPending
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : <X className="w-3 h-3" />}
                                      Confirm
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="gap-1 h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setUnassignPending(group.dispatchBy)}
                                    data-testid={`button-unassign-${group.dispatchBy}`}
                                  >
                                    <X className="w-3 h-3" />
                                    Unassign
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  className="gap-1 h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                                  onClick={() => onDispatchGroup(group)}
                                  data-testid={`button-dispatch-${group.dispatchBy}`}
                                >
                                  <ChevronRight className="w-3 h-3" />
                                  Dispatch All
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${group.dispatchBy}-expanded`}>
                              <td colSpan={5} className="px-2 pb-2 pt-0 bg-muted/20">
                                {groupOrders.length === 0 ? (
                                  <p className="text-xs text-muted-foreground py-2 pl-8">No order details available</p>
                                ) : (
                                  <table className="w-full text-xs mt-1">
                                    <thead>
                                      <tr className="border-b border-border/50">
                                        <th className="text-left py-1 pl-8 font-medium text-muted-foreground">Party</th>
                                        <th className="text-left py-1 font-medium text-muted-foreground hidden sm:table-cell">Brand</th>
                                        <th className="text-left py-1 font-medium text-muted-foreground">Invoice #</th>
                                        <th className="text-center py-1 font-medium text-muted-foreground">Cartons</th>
                                        <th className="text-right py-1 pr-2 font-medium text-muted-foreground">Value</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/30">
                                      {groupOrders.map(o => (
                                        <tr key={o.id} className="hover:bg-muted/30">
                                          <td className="py-1.5 pl-8">{o.partyName || "-"}</td>
                                          <td className="py-1.5 hidden sm:table-cell text-muted-foreground">{o.brand || "-"}</td>
                                          <td className="py-1.5 text-muted-foreground">{o.invoiceNumber || "-"}</td>
                                          <td className="py-1.5 text-center">{o.cases ?? "-"}</td>
                                          <td className="py-1.5 text-right pr-2 font-medium">{formatINR(o.actualOrderValue || o.total)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assign Dialog */}
      <Dialog open={!!assignGroup} onOpenChange={v => !v && setAssignGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Transport Carrier</DialogTitle>
            <DialogDescription>
              Assign a carrier for <strong>{assignGroup?.partyName}</strong> ({assignGroup?.orderCount} order{assignGroup?.orderCount !== 1 ? "s" : ""})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* AI Suggestion banner */}
            {assignGroup?.suggestion && (
              <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-primary mb-0.5">
                  <Zap className="w-3.5 h-3.5" />
                  Suggested: {assignGroup.suggestion.carrierName}
                </div>
                <p className="text-xs text-muted-foreground">{assignGroup.suggestion.reason}</p>
                {assignCarrier === assignGroup.suggestion.carrierName && assignGroup.suggestion.tat && (
                  <p className="text-xs text-muted-foreground mt-0.5">TAT: {assignGroup.suggestion.tat}</p>
                )}
              </div>
            )}

            {/* Carrier comparison table */}
            {assignGroup && carriers.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-2 font-medium">Carrier</th>
                      <th className="text-left p-2 font-medium text-muted-foreground">Type</th>
                      <th className="text-right p-2 font-medium">Est. Cost</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {carriers.map(c => {
                      const cost = assignGroup.carrierCosts[c.id];
                      const isSelected = assignCarrier === c.name;
                      const isSuggested = assignGroup.suggestion?.carrierId === c.id;
                      return (
                        <tr
                          key={c.id}
                          className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-muted/30"}`}
                          onClick={() => setAssignCarrier(c.name)}
                        >
                          <td className="p-2">
                            <div className="flex items-center gap-2">
                              <Truck className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                              <span className={`font-medium ${isSelected ? "text-primary" : ""}`}>{c.name}</span>
                              {isSuggested && (
                                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">
                                  <Zap className="w-2.5 h-2.5 mr-0.5" />
                                  Suggested
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-muted-foreground text-xs capitalize">{c.type.replace(/_/g, " ")}</td>
                          <td className="p-2 text-right">
                            {cost?.matched ? (
                              cost.estimatedCost !== null ? (
                                <span className="font-semibold text-green-700 dark:text-green-400">{formatINR(cost.estimatedCost)}</span>
                              ) : (cost.minRate && cost.maxRate) ? (
                                <span className="text-xs text-muted-foreground">{formatINR(Number(cost.minRate) * assignGroup.orderCount)}–{formatINR(Number(cost.maxRate) * assignGroup.orderCount)}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Rate available</span>
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">No rate</span>
                            )}
                          </td>
                          <td className="p-2 text-right w-6">
                            {isSelected && <Check className="w-4 h-4 text-primary" />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-2">
              <Label>Carrier / Dispatch By</Label>
              <div className="flex gap-2">
                <Select value={assignCarrier} onValueChange={setAssignCarrier}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select carrier" />
                  </SelectTrigger>
                  <SelectContent>
                    {carrierNames.map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Or type custom carrier name..."
                value={assignCarrier}
                onChange={e => setAssignCarrier(e.target.value)}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAssignGroup(null)}>Cancel</Button>
              <Button
                disabled={!assignCarrier || assignMutation.isPending}
                onClick={() => assignGroup && assignMutation.mutate({ orderIds: assignGroup.orderIds, dispatchBy: assignCarrier })}
              >
                {assignMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                Assign to {assignGroup?.orderCount} order{assignGroup?.orderCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transport Management Flyout */}
      <TransportFlyout open={showFlyout} onClose={() => setShowFlyout(false)} />
    </div>
  );
}
