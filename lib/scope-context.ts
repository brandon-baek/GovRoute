import type { PlaceContext } from "@/lib/place-registry";

// A GNIS primary point can be in a county while the community crosses its border.
// Only explicit selections and complete containment support publication matching.
export function publicationPlaceIds(context:PlaceContext|undefined,requested:string[]) {
  if(!context) return [];
  const valid=new Set(context.places.map(place=>place.id));
  const ids=new Set(requested.filter(id=>valid.has(id)));
  let changed=true;
  while(changed) {
    changed=false;
    for(const relation of context.relations) if(relation.relation==="contained_by" && ids.has(relation.child_id) && valid.has(relation.parent_id) && !ids.has(relation.parent_id)) {
      ids.add(relation.parent_id);changed=true;
    }
  }
  return [...ids];
}
