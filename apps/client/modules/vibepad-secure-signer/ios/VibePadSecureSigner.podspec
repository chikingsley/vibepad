Pod::Spec.new do |s|
  s.name             = 'VibePadSecureSigner'
  s.version          = '1.0.0'
  s.summary          = 'Device-bound P-256 signing for VibePad'
  s.description      = 'Stores VibePad DPoP keys in the Secure Enclave and signs request proofs without exporting private key material.'
  s.author           = 'Peacockery Studio'
  s.homepage         = 'https://peacockery.studio'
  s.platforms        = { :ios => '16.4' }
  s.source           = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
