// Gizlilik politikası (KVKK aydınlatma metni) ve kullanım şartları.
//
// ÖNEMLİ: Bunlar bir şablondur. Siteyi yayına almadan önce kendi durumuna göre (işleten kişi/şirket, kullanılan
// hizmet sağlayıcılar, yaş sınırı, uygulanacak hukuk) gözden geçir; mümkünse bir avukata okut.
// {site}, {operator}, {email} yerine /api/config üzerinden OPERATOR_NAME, CONTACT_EMAIL ve SITE_NAME ortam değişkenleri gelir.

export const UPDATED = '2026-10-27';

export const LEGAL = {
  tr: {
    privacy: {
      title: 'Gizlilik Politikası ve KVKK Aydınlatma Metni',
      intro:
        '{site} hizmetini kullanırken kişisel verilerinizin nasıl işlendiğini 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında burada açıklıyoruz. Kısa özet: verilerinizi satmayız, reklam için kullanmayız, siteyi izleme/analiz çerezleriyle takip etmeyiz.',
      sections: [
        { h: '1. Veri sorumlusu', p: ['Veri sorumlusu {operator}’dır. İletişim: {email}'] },
        {
          h: '2. Hangi verileri işliyoruz?',
          ul: [
            'Hesap bilgileri: kullanıcı adı, görünen ad, e-posta adresi ve şifre. Şifre yalnızca geri döndürülemez bir özet (hash) olarak saklanır; biz de dahil kimse şifrenizi göremez.',
            'Profil: kısa tanıtım yazınız.',
            'Kullanım içeriği: açtığınız/katıldığınız gruplar, gönderdiğiniz mesajlar, arkadaşlık ve engelleme kayıtlarınız.',
            'Güvenlik ve moderasyon: sizin yaptığınız ya da sizin hakkınızdaki şikâyetler (şikâyet anındaki mesaj/grup görüntüsü dahil), yasaklama kayıtları, doğrulama ve şifre sıfırlama işlemlerinin teknik kayıtları (kodlar yalnızca özet olarak tutulur).',
            'Teknik veriler: IP adresiniz kötüye kullanımı sınırlamak için kısa süreliğine bellekte kullanılır, veritabanına yazılmaz. Barındırma sağlayıcısı kendi sunucu günlüklerinde IP adresi tutabilir.',
          ],
        },
        {
          h: '3. Amaçlar ve hukuki sebepler',
          p: ['Verileriniz; hesabınızı oluşturmak ve hizmeti sunmak (sözleşmenin kurulması/ifası, KVKK m.5/2-c), e-posta adresinizi doğrulamak, şifrenizi sıfırlamak, kötüye kullanımı ve usulsüzlüğü önlemek, şikâyetleri değerlendirmek (meşru menfaat, m.5/2-f) ve yasal yükümlülükleri yerine getirmek (m.5/2-ç) amaçlarıyla işlenir.'],
        },
        {
          h: '4. Verileriniz kimlerle paylaşılır?',
          p: [
            'Verilerinizi satmaz ve reklam amacıyla kimseyle paylaşmayız. Hizmetin çalışması için şu hizmet sağlayıcılar kullanılır: barındırma sağlayıcısı ve doğrulama/şifre sıfırlama e-postalarını göndermek için e-posta gönderim hizmeti (Resend; bu e-postalar için adresiniz ve ilgili kod bu sağlayıcıya iletilir). Bu sağlayıcılar yurt dışında olabilir; aktarım KVKK m.9 şartlarına uygun yapılır.',
            'Yetkili kurum ve mahkemelerin yasal taleplerinde verileriniz ilgili mercilere verilebilir.',
          ],
        },
        {
          h: '5. Ne kadar süre saklıyoruz?',
          ul: [
            'Hesap bilgileriniz, mesajlarınız ve arkadaşlıklarınız hesabınız açık olduğu sürece saklanır. Profil > Hesabı sil ile hesabınızı kendiniz anında silebilirsiniz; silinince bu veriler ve birebir sohbetleriniz silinir. Düzenli yedek dosyalarında silinen veri en fazla 14 gün daha kalabilir.',
            'Oyun grupları geçicidir: 12 saat boyunca mesaj yazılmayan grup listeden kalkar, 3 gün sonra mesajlarıyla birlikte silinir.',
            'Kapatılan şikâyet kayıtları 180 gün, yönetici işlem kayıtları 1 yıl sonra silinir. Açık şikâyetler incelenene kadar saklanır.',
            'E-postasını 30 gün içinde doğrulamayan hesaplar silinir.',
          ],
        },
        {
          h: '6. Çerezler ve yerel depolama',
          p: ['Yalnızca oturumunuzu açık tutan zorunlu bir çerez (kadro_token) kullanırız; reklam veya izleme çerezi yoktur. Dil tercihiniz tarayıcınızda (localStorage) saklanır. Sayfalar harici bir yazı tipi, analiz ya da reklam servisi yüklemez.'],
        },
        {
          h: '7. Haklarınız (KVKK m.11)',
          ul: [
            'Verilerinizin işlenip işlenmediğini öğrenme ve bilgi talep etme,',
            'İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,',
            'Aktarıldığı üçüncü kişileri bilme,',
            'Eksik/yanlış işlenmişse düzeltilmesini isteme; silinmesini veya yok edilmesini isteme,',
            'Bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme,',
            'Otomatik analiz sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve zarar doğarsa tazminat isteme.',
          ],
          p: ['Başvuru için {email} adresine yazabilirsiniz; en geç 30 gün içinde yanıt veririz. Hesabınızı Profil sayfasından anında silebilirsiniz.'],
        },
        {
          h: '8. Çocuklar',
          p: ['Hizmeti 13 yaşından küçükler kullanamaz. 13 yaşından küçük birinin hesap açtığını fark edersek hesabı sileriz; bildirmek için {email} adresine yazabilirsiniz.'],
        },
        {
          h: '9. Güvenlik',
          p: ['Şifreler güçlü bir algoritmayla özetlenir, oturum çerezi tarayıcı kodlarının erişemeyeceği (HttpOnly) şekilde tutulur, bağlantı HTTPS ile şifrelenir. Hiçbir sistem yüzde yüz güvenli değildir; bir veri ihlali olursa KVKK m.12 uyarınca ilgili kişilere ve Kurula gecikmeden bildirim yaparız.'],
        },
        { h: '10. Değişiklikler', p: ['Bu metni güncelleyebiliriz; önemli değişiklikleri sitede duyururuz. Son güncelleme tarihi sayfanın başındadır.'] },
      ],
    },
    terms: {
      title: 'Kullanım Şartları',
      intro: '{site}’ya kayıt olarak veya kullanarak aşağıdaki şartları kabul etmiş olursunuz. Kısa özet: saygılı ol, kimseyi rahatsız etme, hesabını koru.',
      sections: [
        {
          h: '1. Hizmet',
          p: [
            '{site}, oyunculara oyun seçerek açık gruplar bulma, grup kurma, mesajlaşma, arkadaş ekleme ve kalıcı arkadaş grupları oluşturma imkânı veren ücretsiz bir platformdur; hizmeti {operator} işletir.',
            'Sitede geçen oyun adları ilgili sahiplerinin ticari markalarıdır. {site}; Valve/Steam veya herhangi bir oyun yayıncısıyla bağlantılı, onlar tarafından onaylanmış ya da desteklenmiş değildir.',
          ],
        },
        {
          h: '2. Hesap',
          ul: [
            'Hesap açmak için en az 13 yaşında olmalı ve geçerli bir e-posta adresi kullanmalısınız.',
            'Verdiğiniz bilgiler doğru olmalı, bir kişi birden fazla hesapla kurallardan kaçmamalıdır.',
            'Şifrenizi korumak sizin sorumluluğunuzdadır; hesabınızdan yapılan işlemlerden siz sorumlusunuz.',
          ],
        },
        {
          h: '3. Kurallar',
          p: ['Şunlar yasaktır:'],
          ul: [
            'Taciz, tehdit, aşağılama, nefret söylemi, ayrımcılık,',
            'Spam, reklam, dolandırıcılık, hesap/oyun içi eşya satışı vaadiyle kandırma,',
            'Başkalarının kişisel bilgilerini izinsiz paylaşmak (adres, telefon, kimlik vb.),',
            'Yasa dışı, müstehcen ya da çocukları istismar eden içerik; reşit olmayanlara uygunsuz yaklaşım,',
            'Başkası gibi davranmak, hizmeti aksatmaya veya güvenliğini aşmaya çalışmak, otomatik araçlarla toplu hesap/mesaj üretmek.',
          ],
        },
        {
          h: '4. İçerik ve moderasyon',
          p: [
            'Gönderdiğiniz mesaj ve grup bilgilerinden siz sorumlusunuz. Uygunsuz gördüğünüz kişi, mesaj ve grupları şikâyet edebilir, kişileri engelleyebilirsiniz. Şikâyetler yönetici tarafından incelenir; inceleme için şikâyet edilen içeriğin ve öncesindeki birkaç mesajın görüntüsü saklanır.',
            'Kuralları ihlal eden içerikleri kaldırma, grupları kapatma ve hesapları uyarı yapmadan veya önceden haber vermeden askıya alma/kapatma hakkımız saklıdır.',
          ],
        },
        {
          h: '5. Diğer oyuncularla etkileşim',
          p: ['Platform, tanımadığınız kişilerle tanışmanızı kolaylaştırır; kullanıcıların kimliğini ve niyetini doğrulayamayız. Kişisel bilgi, para ya da hesap bilgilerinizi paylaşmayın; oyun içi ticarette dikkatli olun. Kullanıcılar arasındaki anlaşmazlıklar kendi aralarındadır.'],
        },
        {
          h: '6. Sorumluluğun sınırı',
          p: ['Hizmet “olduğu gibi” sunulur; kesintisiz veya hatasız çalışacağı garanti edilmez. Kanunun izin verdiği ölçüde, hizmetin kullanımından veya kesintisinden doğan dolaylı zararlardan sorumlu değiliz. Kanundan doğan tüketici hakları saklıdır.'],
        },
        {
          h: '7. Hesabı kapatma',
          p: ['Hesabınızı Profil sayfasından istediğiniz an silebilirsiniz. Kuralları ihlal eden hesaplar kapatılabilir. Kişisel verilerin işlenmesi için Gizlilik Politikası’na bakın.'],
        },
        {
          h: '8. Değişiklikler, uygulanacak hukuk',
          p: ['Şartları güncelleyebiliriz; önemli değişikliklerde sitede duyuru yaparız. Güncellemeden sonra hizmeti kullanmaya devam etmek yeni şartları kabul anlamına gelir. Bu şartlara Türkiye Cumhuriyeti hukuku uygulanır; tüketici mevzuatından doğan yetki kuralları saklıdır.'],
        },
        { h: '9. İletişim', p: ['Soru, şikâyet ve talepler için: {email}'] },
      ],
    },
  },
  en: {
    privacy: {
      title: 'Privacy Policy',
      intro:
        'This explains how {site} processes your personal data under Turkish Law No. 6698 (KVKK); you may also contact us to exercise rights available to you in your own country (for example under the GDPR). In short: we do not sell your data, use it for advertising, or track you with analytics cookies.',
      sections: [
        { h: '1. Data controller', p: ['The data controller is {operator}. Contact: {email}'] },
        {
          h: '2. What we process',
          ul: [
            'Account details: username, display name, email address and password. The password is stored only as an irreversible hash; nobody, including us, can read it.',
            'Profile: your short bio.',
            'Content you create: groups you open or join, messages you send, friendships and blocks.',
            'Safety and moderation: reports you make or that concern you (including a snapshot of the reported message/group), ban records, and technical records of verification and password-reset requests (codes are kept only as hashes).',
            'Technical data: your IP address is used briefly in memory to limit abuse and is not written to the database. Our hosting provider may keep IP addresses in its own server logs.',
          ],
        },
        {
          h: '3. Why we process it',
          p: ['To create your account and provide the service (performance of a contract), to verify your email and reset passwords, to prevent abuse and review reports (legitimate interests), and to meet legal obligations.'],
        },
        {
          h: '4. Who receives it',
          p: [
            'We do not sell your data or share it for advertising. We use a hosting provider and an email delivery service (Resend; your address and the code are passed to it to send verification and password-reset emails). These providers may be located abroad; transfers are made in line with applicable law.',
            'We may disclose data to authorities and courts when legally required.',
          ],
        },
        {
          h: '5. How long we keep it',
          ul: [
            'Account data, messages and friendships are kept while your account is open. You can delete your account instantly from Profile > Delete account; this deletes that data and your direct chats. Deleted data may remain in routine backups for up to 14 days.',
            'Game groups are temporary: a group with no messages for 12 hours disappears from the list and is deleted with its messages after 3 more days.',
            'Closed reports are deleted after 180 days and administrator action logs after 1 year. Open reports are kept until reviewed.',
            'Accounts whose email is not verified within 30 days are deleted.',
          ],
        },
        {
          h: '6. Cookies and local storage',
          p: ['We use one strictly necessary cookie (kadro_token) to keep you signed in; there are no advertising or tracking cookies. Your language choice is stored in your browser (localStorage). Pages do not load external fonts, analytics or advertising services.'],
        },
        {
          h: '7. Your rights',
          ul: [
            'Find out whether your data is processed and request information,',
            'Learn the purpose and who it is transferred to,',
            'Ask for correction, deletion or destruction,',
            'Object to results that harm you from automated analysis and claim compensation for damage.',
          ],
          p: ['Write to {email}; we answer within 30 days. You can delete your account at any time from the Profile page.'],
        },
        { h: '8. Children', p: ['Children under 13 may not use the service. If we learn that a child under 13 has an account we delete it; tell us at {email}.'] },
        {
          h: '9. Security',
          p: ['Passwords are hashed with a strong algorithm, the session cookie is HttpOnly, and connections use HTTPS. No system is perfectly secure; if a breach occurs we will notify affected people and the authority without undue delay.'],
        },
        { h: '10. Changes', p: ['We may update this text and will announce important changes on the site. The last update date is shown at the top.'] },
      ],
    },
    terms: {
      title: 'Terms of Use',
      intro: 'By registering for or using {site} you accept these terms. In short: be respectful, do not bother others, protect your account.',
      sections: [
        {
          h: '1. The service',
          p: [
            '{site} is a free platform where players pick a game, find open groups, create groups, chat, add friends and build permanent friend groups. It is operated by {operator}.',
            'Game names are trademarks of their respective owners. {site} is not affiliated with, endorsed or sponsored by Valve/Steam or any game publisher.',
          ],
        },
        {
          h: '2. Your account',
          ul: [
            'You must be at least 13 and use a valid email address.',
            'Information you give must be accurate; do not use multiple accounts to evade rules.',
            'You are responsible for keeping your password safe and for activity under your account.',
          ],
        },
        {
          h: '3. Rules',
          p: ['You may not:'],
          ul: [
            'Harass, threaten, demean or discriminate, or use hate speech,',
            'Spam, advertise, scam, or trick people with promises of selling accounts or in-game items,',
            'Share other people’s personal information without permission,',
            'Post illegal or obscene content, content that exploits children, or approach minors inappropriately,',
            'Impersonate others, disrupt or attack the service, or mass-create accounts/messages with automated tools.',
          ],
        },
        {
          h: '4. Content and moderation',
          p: [
            'You are responsible for the messages and group details you post. You can report people, messages and groups, and block people. Reports are reviewed by an administrator; a snapshot of the reported content and a few preceding messages is kept for review.',
            'We may remove content, close groups and suspend or terminate accounts, with or without notice, if rules are broken.',
          ],
        },
        {
          h: '5. Interacting with other players',
          p: ['The platform helps you meet people you do not know; we cannot verify anyone’s identity or intentions. Do not share personal information, money or account credentials, and be careful with in-game trades. Disputes between users are between them.'],
        },
        {
          h: '6. Limitation of liability',
          p: ['The service is provided “as is” without a guarantee that it will be uninterrupted or error-free. To the extent permitted by law we are not liable for indirect damages arising from use of, or interruption to, the service. Statutory consumer rights remain unaffected.'],
        },
        {
          h: '7. Closing your account',
          p: ['You may delete your account at any time from the Profile page. Accounts that break the rules may be closed. See the Privacy Policy for how personal data is handled.'],
        },
        {
          h: '8. Changes and governing law',
          p: ['We may update these terms and will announce important changes on the site; continuing to use the service after an update means you accept it. These terms are governed by the laws of the Republic of Türkiye, without affecting mandatory consumer-protection rules.'],
        },
        { h: '9. Contact', p: ['Questions, complaints and requests: {email}'] },
      ],
    },
  },
};
