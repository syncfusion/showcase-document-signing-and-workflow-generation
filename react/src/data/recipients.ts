export interface Recipient {
  id: string
  name: string
  role: string
  initials: string
  color: string
  email?: string
}

export const RECIPIENTS: Recipient[] = [
  { id: 'alex-norman', name: 'Alex Norman', role: 'Signer · You', initials: 'AN', color: '#5b4bdb', email: 'alex@northstar.example' },
  { id: 'maya-kapoor', name: 'Maya Kapoor', role: 'Signer · Client', initials: 'MK', color: '#e25589', email: 'maya@client.example' },
]

export const RECIPIENT_COLORS = ['#5b4bdb', '#e25589', '#149570', '#d97706', '#2f80ed', '#8a5cf6', '#0ea5a4']
