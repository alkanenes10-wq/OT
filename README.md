# YKS Takip

YKS öğrencilerinin akademik (haftalık program, konu takibi) ve psikolojik (uyku, erteleme, kaygı, enerji, motivasyon…) takibi için mobil uyumlu web uygulaması. Telefona uygulama gibi eklenebilir, bilgisayardan da açılır.

## Dosyalar

Tüm dosyalar tek düzeydedir, alt klasör yoktur. Vercel derleme sırasında `hazirla.mjs` betiği uygulama dosyalarını otomatik olarak `app` klasörüne yerleştirir; bu yüzden GitHub'a nasıl yüklediğin önemli değildir.

- `schema.sql` → Supabase'de **bir kez** çalıştırılacak veritabanı dosyası
- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `hazirla.mjs` → ayar dosyaları
- Diğer `.tsx / .ts / .css / .png` dosyaları → uygulamanın kendisi

## Kurulum

### 1) Supabase

1. <https://supabase.com> → **New project** → bölge: **Central EU (Frankfurt)**.
2. **SQL Editor → New query** → `schema.sql` dosyasının tamamını yapıştır → **Run** ("Success").
3. **Authentication → Sign In / Providers** → **Allow new users to sign up: KAPALI** → Save.
4. **Project Settings → API Keys** bölümünden şunları kopyala: **Project URL**, **Publishable key**, **Secret key** (eski projelerde: *anon* ve *service_role*).

### 2) GitHub

1. <https://github.com/new> → yeni bir **Private** depo oluştur (veya mevcut depoyu kullan).
2. **Add file → Upload files** → zip'ten çıkan klasördeki **tüm dosyaları** seç (Ctrl+A) ve yükle → **Commit changes**.
   Mevcut depoya yüklüyorsan aynı adlı dosyaların üzerine yazılır; Vercel otomatik olarak yeniden derler.

### 3) Vercel

1. **Add New… → Project** → depoyu **Import** et.
2. **Environment Variables**:

   | Ad | Değer |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (veya *anon*) |
   | `SUPABASE_SECRET_KEY` | Secret key (veya *service_role*) — gizli |
   | `SETUP_SECRET` | Kendi belirlediğin uzun bir parola |
   | `NEXT_PUBLIC_APP_NAME` | *(isteğe bağlı)* Uygulama adı |

3. **Deploy**. Değişkenleri sonradan değiştirirsen **Deployments → Redeploy**.

### 4) İlk giriş ve öğrenciler

1. Vercel adresini aç → giriş sayfasındaki **"Danışman hesabı oluştur"** → `SETUP_SECRET` + bilgilerin. (Yalnızca bir kez yapılır.)
2. **Yeni öğrenci** → ad veya kod (ör. `ÖĞR-001`), kullanıcı adı (ör. `ogr001`), şifre → **Mesajı kopyala** ile öğrenciye gönder.
3. Telefona ekleme — iPhone: Safari → **Paylaş → Ana Ekrana Ekle**. Android: Chrome → **⋮ → Uygulamayı yükle**.

## Özelleştirme

GitHub'da dosyayı düzenleyip kaydettiğinde Vercel otomatik yeniden yayınlar.

- Program ders satırları, uyarı eşikleri (`THRESHOLDS`): `lib.ts`
- Konu listeleri: `curriculum.ts` (konu **adını** değiştirirsen o konudaki eski ilerleme eşleşmez)
- Renkler: `globals.css`
- Alan adı: Vercel → **Settings → Domains**

## Güvenlik ve KVKK

- Veritabanı kuralları (RLS): öğrenci yalnızca kendi verisini, danışman yalnızca kendi öğrencilerini görür. Danışman notlarını öğrenci hiçbir koşulda göremez.
- `SUPABASE_SECRET_KEY` yalnızca sunucuda (Vercel) kullanılır; anahtarları hiçbir dosyaya yazıp GitHub'a yükleme.
- Öğrenci adı yerine kod kullanabilirsin. **Hesap → Öğrenciyi sil** tüm verileri kalıcı olarak siler.
- Supabase sunucuları Türkiye dışında (Frankfurt) olduğundan bu, KVKK'da yurt dışına aktarım sayılabilir; aydınlatma metni / veli onayında belirtmen önerilir (kesin değerlendirme için hukukçuya danış).

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Vercel: *Couldn't find any pages or app directory* | Depoda `hazirla.mjs` ve güncel `package.json` yok → tüm dosyaları tekrar yükle |
| Vercel: *[hazirla] EKSİK DOSYA: …* | Adı yazılan dosyayı depoya yükle |
| "Kurulum tamamlanmamış" ekranı | Vercel ortam değişkenleri eksik → ekle ve **Redeploy** |
| "Veritabanı tabloları bulunamadı" | `schema.sql` Supabase'de çalıştırılmamış |
| Öğrenci eklerken *Invalid API key* | `SUPABASE_SECRET_KEY` yerine legacy **service_role** anahtarını dene |
| Supabase projesi duraklatıldı | Ücretsiz plan 1 hafta kullanılmayınca durur → Supabase panelinden **Restore** |
