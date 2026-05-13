'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Listing, ListingProspect } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ListingDialog } from '@/components/listings/listing-dialog'
import { ProspectPanel } from '@/components/listings/prospect-panel'
import { Plus, MapPin, Building2 } from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  under_negotiation: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-600',
  off_market: 'bg-red-100 text-red-700',
}

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [selected, setSelected] = useState<Listing | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editListing, setEditListing] = useState<Listing | null>(null)

  const fetchListings = useCallback(async () => {
    const { data } = await supabase
      .from('listings')
      .select('*')
      .order('status')
    setListings(data || [])
    if (data?.length && !selected) setSelected(data[0])
  }, [selected])

  useEffect(() => { fetchListings() }, [fetchListings])

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Listings</h1>
          <p className="text-muted-foreground text-sm mt-1">Track B — Active listing inventory & interested parties</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditListing(null); setDialogOpen(true) }}>
          <Plus className="w-4 h-4" /> Add Listing
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Listing cards */}
        <div className="space-y-3">
          {listings.map((l) => (
            <Card
              key={l.id}
              className={`cursor-pointer transition-all ${selected?.id === l.id ? 'ring-2 ring-primary' : 'hover:border-primary/30'}`}
              onClick={() => setSelected(l)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{l.name}</h3>
                    {(l.city || l.state) && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />{l.city}{l.state ? `, ${l.state}` : ''}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${STATUS_COLOR[l.status]}`}>
                    {l.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {l.size_sf && (
                    <span className="text-xs bg-muted px-2 py-0.5 rounded flex items-center gap-1">
                      <Building2 className="w-3 h-3" />{l.size_sf.toLocaleString()} SF
                    </span>
                  )}
                  {l.asking_rate && (
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">${l.asking_rate}/SF/yr</span>
                  )}
                </div>
                {l.target_verticals && l.target_verticals.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {l.target_verticals.map(v => <Badge key={v} variant="outline" className="text-[10px]">{v}</Badge>)}
                  </div>
                )}
                {l.client_name && <p className="text-xs text-muted-foreground mt-2">Owner: {l.client_name}</p>}
              </CardContent>
            </Card>
          ))}
          {listings.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No listings yet.</p>
          )}
        </div>

        {/* Listing detail + prospects */}
        <div className="lg:col-span-2">
          {selected ? (
            <Card className="h-full">
              <CardHeader className="flex flex-row items-start justify-between">
                <CardTitle>{selected.name}</CardTitle>
                <Button variant="outline" size="sm" onClick={() => { setEditListing(selected); setDialogOpen(true) }}>
                  Edit
                </Button>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="details">
                  <TabsList>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="prospects">Interested Parties</TabsTrigger>
                    <TabsTrigger value="touches">Touch Program</TabsTrigger>
                  </TabsList>

                  <TabsContent value="details" className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {selected.address && <div><p className="text-xs text-muted-foreground">Address</p><p>{selected.address}</p></div>}
                      {selected.submarket && <div><p className="text-xs text-muted-foreground">Submarket</p><p>{selected.submarket}</p></div>}
                      {selected.size_sf && <div><p className="text-xs text-muted-foreground">Total SF</p><p>{selected.size_sf.toLocaleString()} SF</p></div>}
                      {selected.asking_rate && <div><p className="text-xs text-muted-foreground">Asking Rate</p><p>${selected.asking_rate}/SF/yr</p></div>}
                      {selected.lease_type && <div><p className="text-xs text-muted-foreground">Lease Type</p><p>{selected.lease_type}</p></div>}
                      {selected.available_date && <div><p className="text-xs text-muted-foreground">Available</p><p>{new Date(selected.available_date).toLocaleDateString()}</p></div>}
                      {selected.client_name && <div><p className="text-xs text-muted-foreground">Client/Owner</p><p>{selected.client_name}</p></div>}
                    </div>
                    {selected.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}
                    {selected.highlights && selected.highlights.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-2">Highlights</p>
                        <ul className="space-y-1">{selected.highlights.map((h, i) => <li key={i} className="text-sm flex gap-2"><span className="text-primary">→</span>{h}</li>)}</ul>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="prospects" className="mt-4">
                    <ProspectPanel listing={selected} />
                  </TabsContent>

                  <TabsContent value="touches" className="mt-4">
                    <TouchProgram listingId={selected.id} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Select a listing to view details
            </div>
          )}
        </div>
      </div>

      <ListingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        listing={editListing}
        onSaved={() => { fetchListings(); setDialogOpen(false) }}
      />
    </div>
  )
}

function TouchProgram({ listingId }: { listingId: string }) {
  const [cadences, setCadences] = useState<{ id: string; companies?: { name: string }; touch_type: string; next_touch_date: string; status: string }[]>([])

  useEffect(() => {
    supabase
      .from('cadences')
      .select('*, companies(name)')
      .eq('listing_id', listingId)
      .order('next_touch_date')
      .then(({ data }) => setCadences(data || []))
  }, [listingId])

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{cadences.length} touches scheduled</p>
      {cadences.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No touch cadence set up yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {cadences.map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2.5 text-sm">
              <div>
                <p className="font-medium">{c.companies?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{c.touch_type?.replace('_', ' ')}</p>
              </div>
              <div className="text-right">
                <p className="text-xs">{new Date(c.next_touch_date).toLocaleDateString()}</p>
                <p className={`text-xs capitalize ${c.status === 'completed' ? 'text-green-600' : 'text-orange-600'}`}>{c.status}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
