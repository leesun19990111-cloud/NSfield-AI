import { getSessionUser } from '@/lib/auth/session'
import { getMyWallet, listMyTransactions } from '@/lib/actions/wallet'
import { getCurrentFxRate } from '@/lib/fx/service'
import { BalanceCard } from '@/components/wallet/BalanceCard'
import { TransactionTable } from '@/components/wallet/TransactionTable'

export default async function WalletPage() {
  const user = await getSessionUser()
  const [wallet, txs, fx] = await Promise.all([
    getMyWallet(),
    listMyTransactions(),
    getCurrentFxRate(),
  ])
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">지갑</h1>
      <BalanceCard balanceKrw={wallet.balance_krw} fxRate={fx} topupCode={user!.topup_code} />
      <div>
        <h2 className="text-sm font-semibold mb-3">거래 내역</h2>
        <TransactionTable items={txs.items} />
      </div>
    </div>
  )
}
