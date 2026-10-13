export const taskTopics = [
  {id:"passport",label:"Passports",pattern:/\bpassport\b/i},
  {id:"birth_certificate",label:"Birth certificates",pattern:/\bbirth (?:certificate|record)\b/i},
  {id:"voter_registration",label:"Voting",pattern:/\b(vot(?:e|er|ing)|election)\b/i},
  {id:"business_tax_id",label:"Business tax IDs",pattern:/\b(ein|employer identification|business tax id)\b/i},
  {id:"building_permit",label:"Building permits",pattern:/\b((?:building|construction|remodel) permit|permit for (?:a )?(?:remodel|addition))\b/i},
  {id:"public_property_repair",label:"Public service reports",pattern:/\b(pothole|illegal dumping|dumped (?:couch|furniture)|damaged public property|(?:broken|damaged) (?:bench|bike rack|parking meter|transit shelter))\b/i},
  {id:"property",label:"Property records and zoning",pattern:/\b(zoning|deed|parcel|land rights|easement|recorded documents|adu)\b/i},
  {id:"driver_license",label:"Driver licenses",pattern:/\b(driver(?:['’]?s)? licen[cs]e|license transfer|transfer (?:an? )?(?:out.of.state )?license)\b/i},
  {id:"vehicle_registration",label:"Vehicle registration",pattern:/\b(vehicle registration|car registration|plates)\b/i}
];
export function taskTopic(query:string) {return taskTopics.find(topic=>topic.pattern.test(query))?.id;}
export function isPropertyLookup(query:string) {
  if (/\b(can|allowed|legal|rights|build|adu|setback|easement|boundary)\b/i.test(query)) return false;
  return /\b(find|look up|lookup|request|copy|copies)\b/i.test(query) && /\b(zoning|deed|recorded|real.estate records)\b/i.test(query);
}
