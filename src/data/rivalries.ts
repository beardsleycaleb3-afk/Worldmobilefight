const RIVAL_INTROS: Record<string, string> = {
  'india-vikram__pakistan-tariq': "Vikram: 'Two legends of the Akhara — step onto the earth!'",
  'pakistan-tariq__india-vikram': "Tariq: 'Punjab steel meets Jaipur iron tonight!'",
  'usa-marcus__china-zhao': "Marcus: 'Let's test Bajiquan against Brooklyn heavyweight power!'",
  'china-zhao__usa-marcus': "Zhao: 'Your reach is wide, Marcus — strike through stone.'",
  'nigeria-chukwuemeka__brazil-rafael': "Chukwuemeka: 'Speed vs Dambe thunder — hold your guard!'",
  'brazil-rafael__nigeria-chukwuemeka': "Rafael: 'Rio rhythm never folds under heavy pressure!'",
  'indonesia-bima__bangladesh-arif': "Bima: 'Move like volcanic ash — never stand still.'",
  'bangladesh-arif__indonesia-bima': "Arif: 'The Padma river tide breaks every stone wall!'",
};

const FIGHTER_INTROS: Record<string, string> = {
  'india-vikram': "Vikram: 'Respect the pit. Leave nothing in reserve!'",
  'china-zhao': "Zhao: 'One rooted breath — then the mountain moves.'",
  'usa-marcus': "Marcus: 'Bell rings in three. Keep those hands up!'",
  'indonesia-bima': "Bima: 'Step inside my range and feel Krakatoa ignite.'",
  'pakistan-tariq': "Tariq: 'None have moved Sher-e-Punjab from the center line.'",
  'nigeria-chukwuemeka': "Chukwuemeka: 'One clean Dambe right ends the night!'",
  'brazil-rafael': "Rafael: 'Footwork sharp, guard tight — let's dance!'",
  'bangladesh-arif': "Arif: 'Boli Khela grit carries the whole delta!'",
};

const VICTORY_QUOTES: Record<string, string> = {
  'india-vikram': 'Iron forged in Akhara clay never cracks.',
  'china-zhao': 'Balance conquered force before the first strike.',
  'usa-marcus': 'Heavyweight championship power speaks for itself.',
  'indonesia-bima': 'Fast as lightning, relentless as Merapi magma.',
  'pakistan-tariq': 'Stand tall at the center of the ring — undefeated.',
  'nigeria-chukwuemeka': 'Lagos Thunder echoed through every corner.',
  'brazil-rafael': 'Precision pressure breaks any defense.',
  'bangladesh-arif': 'Padma Uppercut — champion of the river arena.',
};

export function getRivalIntroLine(p1Id: string, p2Id: string): string {
  const key = `${p1Id}__${p2Id}`;
  return RIVAL_INTROS[key] || FIGHTER_INTROS[p1Id] || 'TOUCH GLOVES · FIGHT HARD!';
}

export function getVictoryQuote(winnerId: string): string {
  return VICTORY_QUOTES[winnerId] || 'Championship grit carried the night.';
}
