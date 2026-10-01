# YKS Takip

YKS öğrencilerinin akademik (haftalık program, konu takibi) ve psikolojik (uyku, erteleme, kaygı, enerji, motivasyon…) takibi için mobil uyumlu web uygulaması. Telefona uygulama gibi eklenebilir, bilgisayardan da açılır.

## Dosyalar

Tüm dosyalar tek düzeydedir, alt klasör yoktur. Vercel derleme sırasında `hazirla.mjs` betiği uygulama dosyalarını otomatik olarak `app` klasörüne yerleştirir; bu yüzden GitHub'a nasıl yüklediğin önemli değildir.

- `schema.sql` → Supabase'de **bir kez** çalıştırılacak veritabanı dosyası
- `guncelleme-2.sql` … `guncelleme-10.sql` → mevcut kurulumlar için güncelleme dosyaları
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

## Güncelleme 2.7 — konu ilerlemesi ve çalışma saatlerine otomatik yerleştirme

SQL gerekmez (2.6'nın SQL'leri yeterli). Yeni dosya: `yerlestir.ts`.

- **Soruları biten konu atlanır:** Otomatik programda bir konunun kitaptaki testleri bittiyse (katalogda test → konu eşleşmesi varsa) ya da kitap yoksa o konuda 3 soru görevi tamamlandıysa konu atlanır, bölümdeki sıradaki konuya geçilir. Önizlemede "Soruları biten konular atlandı" kutusunda görünür. Denemede o konuda yanlış varsa "tekrar" olarak yine programa girer.
- **Kitaptan sırayla ilerleme:** Öğrencinin kitabındaki sıradaki konu haftada en az 2 blok alır; bloklara sıradaki testler (ör. T4, T5) otomatik bağlanır. Testler hafta içinde biterse o konu yerine başka konuya geçilir. Görev tamamlanınca testler kitapta işaretlenir.
- **TYT/AYT dengesi düzeltildi:** denge artık sayısal ve sözel içinde ayrı kurulur (önceden SAY öğrencisinde sayısal blokların neredeyse hepsi AYT'ye kayıyordu).
- **Çalışma saatlerine otomatik yerleştirme:** saatsiz eklenen görev, o günün çalışma saatlerindeki ilk boş yere yerleşir; görev başka güne taşınınca yeni günde boş yere alınır; takvimde çalışma saati dışına ya da başka bloğun üstüne bırakılan blok en yakın uygun saate kayar. **"Saatlere yerleştir"** düğmesi haftanın bütün bloklarını sırası korunarak çalışma saatlerine dizer.

## Güncelleme 2.6 — kaynak kataloğu

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-10.sql` → **Run** (2.5'i henüz yüklemediyseniz önce `guncelleme-9.sql`). Yeni dosya: `katalog.tsx`.

- **Ayarlar → Kaynak kataloğu:** kitaplar sistemde tanımlanır (yayınevi, kitap adı, ders, tür, test sayısı). "Toplu ekle" ile Excel'den yapıştırılabilir (`Yayınevi | Kitap adı | Ders | Test sayısı`). İsteğe bağlı olarak hangi testin hangi konu olduğu (ör. Test 1–6 → Üslü İfadeler) tanımlanır. Katalog tüm danışmanlar için ortaktır; bir kitabı düzenlemek öğrencilerin listesini de günceller. "Kaldır" yeni seçimleri kapatır, mevcut listeleri bozmaz.
- **Öğrenci:** Konular → Kaynaklar → "Kaynak ekle" ile yalnızca katalogdan seçer; kitap bilgilerini değiştiremez, kaynak silemez. Testin numarasına dokunup doğru/yanlış girer; konu katalogdan kendiliğinden yazılır. Kaynağı "Devam / Ara verdim / Bitti" olarak işaretleyebilir.
- **Danışman:** öğrenci adına katalogdan ekler; katalogda olmayan kitabı aynı pencereden tanımlayıp ekleyebilir.
- Bu kurallar veritabanında da uygulanır (öğrenci katalog dışı kaynak oluşturamaz).

## Güncelleme 2.5 — ortak soru forumu

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-9.sql` → **Run**. Yeni dosya: `forum.tsx`.

- **Öğrenci → Sorular → Ortak sorular:** tüm öğrencilerin paylaştığı sorular. Herkes **tamamen anonim** ("Bir arkadaşın"). Cevap yazılabilir, çözüm fotoğrafı eklenebilir; soru sahibi "İşime yaradı" deyince soru "Çözüldü" olur. Uygunsuz içerik "Bildir" ile danışmana gider.
- **Paylaşmak:** Sorularım'da soruyu aç → "Arkadaşlarına sor (anonim)".
- **Onay:** öğrencinin paylaştığı soru ve yazdığı cevap, **kendi danışmanı onaylayınca** herkese açılır. Danışman → **Soru forumu → Onay bekleyen** (öğrencinin adı yalnızca burada, danışmana görünür). Danışman cevapları "Danışman" etiketiyle hemen yayınlanır; her danışman yayındaki bir içeriği gizleyebilir.
- Kötüye kullanıma karşı: günde en fazla 10 soru paylaşımı ve 30 cevap.

## Güncelleme 2.4 — hatırlatma merkezi, konu başarı analizi, kaynak takibi

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-8.sql` → **Run**. Yeni dosyalar: `hatirlatma.tsx`, `konu-analizi.tsx`, `kaynaklar.tsx`.

- **Hatırlatma (sol menü):** bugün görevi eksik / günlüğü yok / 3+ gündür kayıt yok / programsız öğrenciler. Şablondaki {ad}, {kalan}, {gorevler}, {haftalik}, {son_gunluk} her öğrencinin verisiyle dolar. WhatsApp'ta aç (telefon kayıtlıysa doğrudan o kişide), tek tıkla uygulama içi not veya seçilenlere toplu not. "Sıradaki" düğmesi gönderilmemiş bir sonraki öğrenciyi açar.
- **Öğrenci → Hesap → İletişim:** öğrenci ve veli telefonu (yalnızca danışman görür).
- **Konular → Başarı analizi:** derslere göre doğru oranı, öncelikli 10 konu (düşük doğru oranı + deneme yanlışları + son haftalardaki düşüş), son 8 haftanın konu × hafta tablosu.
- **Konular → Kaynaklar:** öğrencinin kitapları, test test ilerleme ve doğru oranı, kitapta zorlanılan konular. Program görevine kaynak + test numarası (ör. 12-14) bağlanabilir; görev tamamlanınca testler kendiliğinden işaretlenir.
- **Görev satırları:** öğrenci "Çözdüğüm"ün altında doğru / yanlış sayısını da girebilir (analizin temeli).

## Güncelleme 2.3 — çizgi grafik ve kişisel renk paleti

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-7.sql` → **Run**. Yeni dosya: `theme.tsx`.

- **Özet → Gelişim → Çubuk / Çizgi:** çözülen soru, çalışma süresi, program tamamlama ve uyku grafiklerini çizgiye çevirir. Seçim cihazda hatırlanır.
- **Ayarlar → Görünüm:** öğrenci (ve danışman) 7 renk paletinden birini (Petrol, Okyanus, Mor, Gül, Gün batımı, Orman, Grafit) ve Otomatik / Açık / Koyu temayı seçer. Seçim hesaba kaydedilir; telefonda ve bilgisayarda aynı görünür. Grafik renkleri okunabilirlik için sabittir.

## Güncelleme 2.2 — iki sürüm birleştirildi + gelişim panosu

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-6.sql` → **Run** (öğrenciyle paylaşılan notlar). `guncelleme-5.sql` daha önce çalıştırıldıysa tekrar gerekmez.

- **Özet → Gelişim:** Gün / Hafta / Ay seçimiyle çözülen soru (sayısal/sözel), çalışma süresi, program tamamlama, derslere göre soru, motivasyon-kaygı-enerji, uyku, TYT/AYT net grafikleri. Öğrenci aynısını **İlerleme** ekranında görür.
- **Program → Takvim görünümü:** blokları sürükleyip başka gün/saate taşıma, boş alana tıklayıp görev ekleme. Otomatik programda sade ayarlar, önizlemede **Değiştir** / **×**.
- **Denemeler → Konu bazlı yanlış geçmişi:** hangi konuda kaç denemede, hangi tarihte kaç yanlış.
- **Notlar → Öğrenciyle paylaşılan notlar:** öğrenci Bugün ekranında görür, "Okudum" der.
- Takvim, Sorular, Görüşmeler, Veli raporu, günlük değişken analizi aynen korundu.

## Güncelleme 2 — yeni haftalık program ve deneme analizi

Bu sürümü mevcut kuruluma yüklerken **bir kez** şunu yap: Supabase → SQL Editor → `guncelleme-2.sql` dosyasının tamamını yapıştır → **Run**. (Veri silmez.) Sonra tüm dosyaları GitHub'a yükle.

- **Program → Tablo:** Excel gibi; ders × gün. Hücreye tıkla → konu, görev türü (Soru / Konu / Tekrar / Deneme), hedef soru. Üst satırda her günün **müsaitliği** (Kapalı / Hafif / Normal / Yoğun).
- **Denemeler sekmesi:** kazanım karnesini (PDF) yükle; netler ve konu konu yanlış/boş sayıları otomatik okunur (gerekirse elle düzeltilir).
- **Otomatik program oluştur:** son denemedeki yanlış/boşlara ve müsait günlere göre her öncelikli konu için kısa konu tekrarı + soru çözümü dağıtır, günlük/haftalık hedef soruyu hesaplar. Sonra tabloda istediğin gibi düzenlersin. Soru hedefleri ve konu başına üst sınır `planner.ts` içinde.
- **Otomatik konu takibi:** görev tamamlanınca (ya da öğrenci hedef soru sayısına ulaşınca) konu takibi güncellenir: Konu → Bitti, Soru → Çalışılıyor, Tekrar → Tekrar edildi. Hiçbir zaman geri almaz.

## Güncelleme 8 — gelişim panosu (gün / hafta / ay)

SQL gerekmez. Yeni dosya: `progress.tsx`.

- **Danışman → öğrenci → Özet** ve **öğrenci → İlerleme** ekranında "Gelişim" bölümü. Üstteki **Gün / Hafta / Ay** seçimi: son 30 gün, son 12 hafta veya son 6 ay.
- Özet kutuları: bu dönem çözülen soru ve çalışma süresi (önceki döneme göre değişim), program tamamlama yüzdesi, doğru oranı.
- Grafikler: sayısal/sözel çözülen soru, çalışma süresi, program tamamlama (%80 çizgisi), derslere göre soru, motivasyon-kaygı-enerji, uyku, TYT ve AYT net gelişimi. Çubukların üzerine gelince ayrıntı görünür.
- Veriler programdaki görev sonuçlarından, günlük takipten ve denemelerden otomatik gelir.

## Güncelleme 7 — takvim görünümü ve kolay düzenleme

SQL gerekmez. Yeni dosya: `calendar.tsx`.

- **Program → Takvim:** günler sütun, saatler satır. Bloğu sürükleyip başka gün/saate bırak; boş alana tıklayınca o saate görev ekle; bloğa tıklayınca düzenle. (Telefonda sürükleme yok; düzenleyicide gün/saat değiştirilir.)
- **Görev düzenleyici:** "Başka konu öner" aynı dersten öncelikli konuları (deneme yanlışı, tekrar eden eksik, sıradaki konu) önerir. Öğrenci sonuçları katlanmış bölümde.
- **Otomatik program:** yalnızca tarih ve TYT/AYT denemesi görünür; dersler, oran, sıra, rutinler "Gelişmiş ayarlar"da. Önizlemede her blokta **Değiştir** (başka konu) ve **×** (kaldır).
- **Denemeler → Konu bazlı yanlış geçmişi:** her konu kaç denemede, hangi tarihlerde kaç yanlış/boş yapılmış. 2+ denemede tekrar eden eksikler otomatik programda öne alınır.

## Güncelleme 6 — öğrenciyle paylaşılan notlar

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-5.sql` → **Run**. Yeni dosya: `notes.tsx`.

- Öğrenci → **Notlar** sekmesi: üstte **"Öğrenciyle paylaşılan notlar"** (öğrenci Bugün ekranında görür, okuduğunda "Okundu" yazar), altta **"Özel görüşme notları"** (yalnızca sen görürsün).
- Destek panelinde öğrencinin notuna **"Öğrenciye gönder"** ile yanıt verilebilir.
- Öğrencinin destek ekranında 112 butonu yoktur; öğrenci danışmanına not bırakır.

## Güncelleme 5 — destek / risk yönlendirmesi

Yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-4.sql` → **Run**. Yeni dosya: `support.tsx`.

- **Otomatik uyarı:** Öğrenci günlük takibi kaydettikçe son 3 kayıt (son 7 gün) incelenir: 3 kayıtta da kaygı 4-5, ya da 3 kayıtta da motivasyon ve enerji 1-2, ya da en az 2 gün yüksek kaygı + 5 saatten az uyku → uyarı. Eşikler `guncelleme-4.sql` içindeki `check_support_risk` fonksiyonunda.
- **Öğrenci:** Bugün ekranında her zaman "Zor bir gün mü?" bağlantısı; otomatik uyarı oluşunca nazik bir destek kartı ("Konuşmak istiyorum" / "Şimdilik iyiyim"). Öğrenci uyarı nedenlerini ve danışman notlarını göremez.
- **Danışman:** Öğrenciler sayfasının üstünde "Destek gerekenler" listesi (önce öğrencinin kendi istekleri). Öğrenci → Özet → "Destek ve takip": Gördüm / Görüştüm / Veliyle paylaştım / Okul rehberliğine bildirdim / Uzmana yönlendirdim / Not / Kapattım — her adım tarihiyle kaydedilir.
- Bu bir kriz müdahale sistemi değildir; uyarılar danışman uygulamayı açtığında görülür.

## Danışman ekleme (ekip)

İlk kurulan danışman hesabı **yöneticidir**. Yönetici: **Ayarlar → Danışmanlar → Danışman ekle** → ad soyad, e-posta, geçici şifre → **Mesajı kopyala** ile yeni danışmana gönder. SQL gerekmez.

- Her danışman kendi e-postasıyla girer ve **yalnızca kendi eklediği öğrencileri** görür.
- Yönetici; danışmanın şifresini yenileyebilir, pasif yapabilir veya silebilir (silinen danışmanın öğrencileri ve notları yöneticiye geçer).
- Öğrenci aktarma: öğrenci → **Hesap** → **Başka danışmana aktar** (program, günlük ve danışman notları yeni danışmana geçer).

## Güncelleme 4 — çalışma saatleri ve saatli program

Bu sürümü yüklerken **bir kez**: Supabase → SQL Editor → `guncelleme-3.sql` dosyasının tamamını yapıştır → **Run** (veri silmez). Sonra tüm dosyaları GitHub'a yükle (yeni dosya: `schedule.tsx`).

- **Saatler sekmesi (danışman):** Her gün için çalışma saat aralıkları (ör. 17:00–19:30, 20:00–22:00), blok süresi (varsayılan 40 dk) ve mola (10 dk). Öğrenci bu saatleri Program sayfasında yalnızca görür.
- **Otomatik program:** Saatler bloklara bölünür; her blok bir konu. Bloklar **bir sayısal, bir sözel** sırasıyla dizilir (istersen 2 sayısal–1 sözel / 1 sayısal–2 sözel).
- **Alana göre dersler** (TYT dahil): SAY → Mat, Geo, Fizik, Kimya, Biyoloji (+ Türkçe); EA → Mat, Geo, Türkçe, Edebiyat, Tarih, Coğrafya; SÖZ → Türkçe, Edebiyat, Tarih, Coğrafya, Felsefe, Din (+ TYT Mat). Oluştururken ders kutucuklarından değiştirilebilir. Liste: `lib.ts` → `FIELD_SECTIONS`.
- **TYT ve AYT ayrı:** son TYT ve son AYT denemesi ayrı seçilir; bloklar TYT/AYT oranına göre dağılır (11. sınıf varsayılan TYT %70, 12/mezun %50).
- **Önceki programlar:** geçen haftadan tamamlanmayan konular öne alınır, geçen hafta konu çalışması yapılan konulara bu hafta soru verilir, uzun süredir görülmeyen bitmiş konular tekrar edilir, her dersin sıradaki başlanmamış konusu "yeni konu" olarak eklenir.
- Aynı haftaya yeniden oluşturursan tamamlanmamış görevler silinip yenisi yazılır, tamamlananlar kalır. Sayısal dersler tabloda mavi, sözel dersler turuncu çizgiyle gösterilir.

## Güncelleme 3 — karne kodla okunur

SQL çalıştırmaya gerek yok. Tüm dosyaları GitHub'a yükle (yeni dosya: `karne.ts`). Vercel'de daha önce `ANTHROPIC_API_KEY` eklediysen artık kullanılmıyor, silebilirsin.

## Otomatik karne analizi (kodla, yapay zekâsız)

Karne PDF'i sunucuda **kodla** okunur (`karne.ts`); hiçbir yapay zekâ servisi veya ek API anahtarı kullanılmaz, karne dışarıya gönderilmez.

Nasıl çalışır:

1. PDF'in metin katmanı konum bilgisiyle okunur (`unpdf`).
2. **D / Y / B** (Doğru / Yanlış / Boş) sütun başlıkları bulunur, alttaki satırlardaki sayılar sütunlara eşlenir. Başlık yoksa *soru = doğru + yanlış + boş* kuralını sağlayan sayı dizisi aranır. Soru soru listelenen karnelerde satırdaki durum (D/Y/B, ✓/✗ veya cevap anahtarı ≠ öğrenci cevabı) kullanılır.
3. Satırdaki kazanım metni, uygulamanın konu listesi + eş anlamlılar (`SYNONYMS`) ile eşleştirilir; ders başlığı (Türkçe, Temel Matematik…) bağlam olarak kullanılır.
4. Bölüm net satırları (Türkçe 40 30 8 2 …) netlere, yanlış/boş sayıları konulara yazılır ve program oluşturma penceresi açılır.

Kullanım: Öğrenci → **Denemeler** → **Kazanım karnesini yükle** → birkaç saniye → **Programı oluştur**. Yükleme sonrası "Okuma raporu"nda eşleşmeyen satırlar listelenir; sonuçlar ve program her zaman düzenlenebilir.

Sınırlar: Yalnızca yayınevinin verdiği **orijinal (metin içeren) PDF** okunur. Fotoğraf veya taranmış PDF kodla okunamaz → "Karnesiz elle giriş". Bir yayınevinin ifadesi eşleşmiyorsa `karne.ts` içindeki `SYNONYMS` listesine ifadeyi ekle (ör. `"tyt-matematik.problemler": [..., "yeni ifade"]`).

## Özelleştirme

GitHub'da dosyayı düzenleyip kaydettiğinde Vercel otomatik yeniden yayınlar.

- Program ders satırları, uyarı eşikleri (`THRESHOLDS`): `lib.ts`
- Konu listeleri: `curriculum.ts` (konu **adını** değiştirirsen o konudaki eski ilerleme eşleşmez)
- Renkler ve tema ("Sakin": krem zemin, petrol yeşili, Fraunces + IBM Plex Sans): `globals.css` (`:root` bölümü); yazı tipleri `layout.tsx`
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
