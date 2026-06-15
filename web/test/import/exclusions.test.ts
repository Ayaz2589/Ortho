import { describe, it, expect } from 'vitest'
import { classifyExclusion } from '../../scripts/import/engine/exclusions'

describe('classifyExclusion', () => {
  it('flags credit-card bill payments', () => {
    expect(classifyExclusion('ELECTRONIC PMT-WEB, AMEX EPAYMENT ACH PMT A5390')).toEqual({
      excluded: true,
      reason: 'cc-payment',
    })
    expect(classifyExclusion('ELECTRONIC PMT-WEB, APPLECARD GSBANK PAYMENT 1962740').excluded).toBe(true)
    expect(classifyExclusion('ACH DEBIT, CHASE CREDIT CRD AUTOPAY ****00000371642').reason).toBe('cc-payment')
  })

  it('flags investment transfers', () => {
    expect(classifyExclusion('ELECTRONIC PMT-WEB, WEALTHFRONT EDI PYMNTS ****40423CCB40').reason).toBe('investment')
  })

  it('flags internal account transfers', () => {
    expect(classifyExclusion('eTransfer Debit, Online Xfer Transfer to SV 00006772817632').reason).toBe('internal-transfer')
    expect(classifyExclusion('eTransfer Credit, Online Xfer Transfer from SV 00006772817632').reason).toBe('internal-transfer')
    expect(classifyExclusion('eTransfer Debit, Online Xfer Transfer to ML 6022371130').reason).toBe('internal-transfer')
    expect(classifyExclusion('DEBIT TRANSFER, DDA TRNSFR TRANSFER TO SAVINGS ACCT 9400400000000006772817632').reason).toBe('internal-transfer')
  })

  it('does not flag real spending or person-to-person income', () => {
    expect(classifyExclusion('ACH DEBIT, VERIZON PAYMENTREC ****461550001').excluded).toBe(false)
    expect(classifyExclusion('TD ZELLE RECEIVED, 612200F02W7C Zelle TASNUVA AHMED').excluded).toBe(false)
    expect(classifyExclusion('TD ZELLE SENT, 612700B0LLLE Zelle VUKSANI PLUMBING').excluded).toBe(false)
  })
})
