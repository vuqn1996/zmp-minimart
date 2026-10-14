import { useCallback, useEffect, useState } from "react";
import { openPhone, openWebview } from "zmp-sdk-modern/apis";
import { APP_VERSION, type AccountInfoSection } from "./appInfo.js";
import { SHOP } from "../config.js";
import { Button, Sheet } from "zmp-ui";

import type { Branch } from "../api.js";

export function TermsSheet({ visible, branches, onClose, initialSection = "terms", children }: {
  initialSection?: AccountInfoSection;
  children?: React.ReactNode;
  visible: boolean;
  branches: Branch[];
  onClose: () => void;
}) {
  const [contactError, setContactError] = useState<string | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(initialSection === "privacy");
  useEffect(() => { if (visible) setContactError(null); }, [visible]);
  useEffect(() => { setPrivacyOpen(visible && initialSection === "privacy"); }, [visible, initialSection]);
  const attachContent = useCallback((node: HTMLElement | null) => {
    if (!node || !visible) return;
    requestAnimationFrame(() => {
      if (!node.isConnected) return;
      const target = node.querySelector<HTMLElement>(`[data-section="${initialSection}"]`);
      if (target) {
        target.setAttribute("open", "");
        node.scrollTop += target.getBoundingClientRect().top - node.getBoundingClientRect().top;
      }
    });
  }, [initialSection, visible]);
  const nativeLink = async (event: React.MouseEvent, action: () => Promise<void>) => {
    if (!Reflect.has(window, "ZaloJavaScriptInterface")) return;
    event.preventDefault();
    try { await action(); } catch { setContactError("Không thể mở kênh liên hệ. Bạn có thể dùng địa chỉ hoặc số điện thoại hiển thị bên dưới."); }
  };
  return (
    <Sheet visible={visible} title={initialSection === "support" ? "Hỗ trợ và liên hệ" : "Thông tin cửa hàng và chính sách"} onClose={onClose} autoHeight unmountOnClose className="terms-sheet">
      <section ref={attachContent} className="terms-content" aria-label={initialSection === "support" ? "Hỗ trợ và liên hệ" : "Thông tin cửa hàng và chính sách"}>
        {initialSection !== "support" && <>
        <h1 className="visually-hidden">Thông tin cửa hàng và chính sách</h1>
        <p className="terms-draft">Nội dung mẫu. Hãy thay bằng thông tin doanh nghiệp và chính sách thực tế của cửa hàng trước khi phát hành.</p>

        <details data-section="company" open={initialSection === "company"}>
          <summary><h2>Thông tin doanh nghiệp</h2></summary>
          <div className="terms-section-body">
            <p>Mini App {SHOP.shopName} được vận hành bởi <strong>{SHOP.companyName}</strong>.</p>
            <dl>
              <dt>Phiên bản Mini App</dt><dd>{APP_VERSION}</dd>
              <dt>Mã số doanh nghiệp</dt><dd>{SHOP.taxCode}</dd>
              <dt>Trụ sở</dt><dd>{SHOP.companyAddress}</dd>
            </dl>
            {branches.map((branch) => <p key={branch.id}><strong>{branch.name}:</strong> {branch.address || "Địa chỉ đang cập nhật."}</p>)}
            <p>Công ty chịu trách nhiệm về hàng hóa, thực hiện đơn hàng và xử lý yêu cầu của khách tại tất cả chi nhánh.</p>
            <p>Thông tin liên hệ và tiếp nhận hỗ trợ được công bố trong mục Hỗ trợ và liên hệ tại Cá nhân.</p>
          </div>
        </details>

        <details data-section="terms" open={initialSection === "terms"}>
          <summary><h2>Điều kiện giao dịch và đặt hàng</h2></summary>
          <div className="terms-section-body">
            <p>Khách có thể xem sản phẩm, chọn cửa hàng, thêm hàng vào giỏ và đặt mua qua Mini App. Trước khi xác nhận, vui lòng kiểm tra sản phẩm, quy cách, số lượng, giá, cửa hàng, hình thức nhận hàng, thông tin người nhận và phương thức thanh toán.</p>
            <p>Giá hiển thị đã bao gồm các khoản thuế áp dụng. Cửa hàng không thu phụ phí ngoài số tiền được thông báo trước khi khách xác nhận giao dịch.</p>
            <p>Cửa hàng kiểm tra khả năng đáp ứng và xác nhận đơn sau khi nhận yêu cầu. Thanh toán thành công và xác nhận thực hiện đơn là hai thông tin riêng.</p>
            <p>Nếu thiếu hàng hoặc cần thay đổi thời gian thực hiện, cửa hàng thông báo để khách lựa chọn tiếp tục, nhận phần hàng còn lại, đồng ý sản phẩm thay thế hoặc hủy và hoàn tiền đối với phần không thực hiện. Cửa hàng chỉ thay sản phẩm khi khách đồng ý.</p>
            <p>Khách có thể yêu cầu điều chỉnh hoặc hủy đơn qua kênh hỗ trợ. Cửa hàng kiểm tra tình trạng đơn và xử lý theo chính sách hủy, đổi trả và hoàn tiền.</p>
            <p>Thay đổi điều khoản được công bố cùng ngày áp dụng. Việc xử lý đơn đã xác nhận căn cứ điều kiện của giao dịch và quy định pháp luật áp dụng.</p>
          </div>
        </details>

        <details data-section="payment" >
          <summary><h2>Thanh toán và hóa đơn</h2></summary>
          <div className="terms-section-body">
            <p>Cửa hàng hỗ trợ ZaloPay và COD (thanh toán khi nhận hàng). Khách kiểm tra số tiền và thông tin giao dịch trước khi thanh toán.</p>
            <p>Với ZaloPay, thực hiện theo hướng dẫn trong luồng thanh toán. Với COD, thanh toán theo số tiền của đơn đã xác nhận khi nhận hàng.</p>
            <p>Không thanh toán thêm cho tài khoản hoặc người nhận chưa được cửa hàng xác nhận. Nếu đã bị trừ tiền nhưng đơn chưa ghi nhận thanh toán, vui lòng liên hệ hỗ trợ và cung cấp mã đơn, mã giao dịch nếu có để đối chiếu.</p>
            <p>Quy trình xuất hóa đơn điện tử, thời điểm phát hành và kênh gửi hóa đơn: đang cập nhật. Việc gửi yêu cầu hóa đơn chưa đồng nghĩa hóa đơn đã được phát hành.</p>
          </div>
        </details>

        <details data-section="delivery" >
          <summary><h2>Giao hàng và nhận tại cửa hàng</h2></summary>
          <div className="terms-section-body">
            <p>Phạm vi giao hàng, phí giao và thời gian giao dự kiến được hiển thị theo từng chi nhánh trước khi khách xác nhận đơn. Khách ngoài phạm vi giao hàng có thể chọn đến cửa hàng nhận hàng.</p>
            <p>Khách cung cấp tên, số điện thoại và địa chỉ chính xác nếu chọn giao hàng. Khi cần sửa thông tin, vui lòng liên hệ cửa hàng sớm để kiểm tra khả năng điều chỉnh.</p>
            <p>Thời gian giao là dự kiến. Nếu không thể đáp ứng, cửa hàng liên hệ để thống nhất thời gian mới hoặc phương án xử lý đơn.</p>
            <p>Giờ nhận đơn và giao hàng: đang cập nhật.</p>
          </div>
        </details>

        <details data-section="refund" >
          <summary><h2>Đổi trả và hoàn tiền</h2></summary>
          <div className="terms-section-body">
            <h3>Hàng sai, thiếu hoặc hỏng</h3>
            <p>Cửa hàng đổi hoặc giao bổ sung nếu giao sai hoặc thiếu. Với hàng hỏng, cửa hàng đổi hàng hoặc hoàn tiền cho phần hàng bị ảnh hưởng.</p>
            <p>Vui lòng phản ánh trong vòng 12 giờ sau khi nhận hàng, kèm mã đơn và thông tin vấn đề. Hình ảnh có thể giúp kiểm tra nhanh hơn. Cửa hàng kiểm tra và xác nhận phương án trong vòng 4 giờ kể từ khi nhận phản ánh.</p>
            <p>Cửa hàng chịu chi phí đổi hàng, giao bổ sung và thu hồi hàng lỗi. Mốc 12 giờ hỗ trợ kiểm tra kịp thời, không tự động loại bỏ mọi quyền của khách đối với hàng hóa có lỗi hoặc khuyết tật.</p>
            <h3>Khách thay đổi nhu cầu</h3>
            <p>Nếu hàng đúng nhưng khách đổi ý, yêu cầu hủy hoặc thay đổi phải được cửa hàng xác nhận trước khi đơn bắt đầu giao. Sau khi bắt đầu giao, cửa hàng không nhận trả chỉ vì khách đổi ý. Quy tắc này không ảnh hưởng việc xử lý hàng sai, thiếu hoặc hỏng.</p>
            <h3>Số tiền và thời hạn hoàn</h3>
            <p>Đơn đã thanh toán được hủy hợp lệ: hoàn toàn bộ số tiền khách thực trả. Nếu chỉ một phần đơn có vấn đề, đổi, bổ sung hoặc hoàn tiền cho phần bị ảnh hưởng theo số tiền thực trả của phần hàng đó.</p>
            <p><strong>ZaloPay:</strong> Cửa hàng gửi yêu cầu hoàn tiền trong vòng 12 giờ kể từ khi cửa hàng xác nhận hoàn tiền. Thời điểm và nơi nhận tiền phụ thuộc phương thức thanh toán, ngân hàng và chính sách áp dụng cho giao dịch.</p>
            <p>Một số giao dịch khuyến mãi có điều kiện riêng về hoàn tiền. Cửa hàng đối chiếu giao dịch và thống nhất phương án xử lý với khách. Tham khảo <a href="https://docs.zalopay.vn/vi/docs/faq/" target="_blank" rel="noopener noreferrer">thông tin hoàn tiền của ZaloPay</a>.</p>
            <p><strong>COD:</strong> hoàn tiền trong vòng 24 giờ kể từ khi cửa hàng xác nhận hoàn tiền, bằng tiền mặt hoặc chuyển khoản theo lựa chọn của khách.</p>
          </div>
        </details>

        </>}
        {initialSection === "support" && <details data-section="support" open>
          <summary><h2>Phản ánh và khiếu nại</h2></summary>
          <div className="terms-section-body">
            <p>Cửa hàng dùng một đầu mối chung để tiếp nhận hỗ trợ, phản ánh, đổi trả và yêu cầu về dữ liệu cá nhân.</p>
            <dl className="contact-details">
              <dt>Hotline</dt><dd><a href={`tel:${SHOP.hotline}`} onClick={(event) => void nativeLink(event, () => openPhone({ phoneNumber: SHOP.hotline }))}>{SHOP.hotline}</a></dd>
              <dt>Email</dt><dd><a href={`mailto:${SHOP.email}`}>{SHOP.email}</a></dd>
              <dt>Facebook</dt><dd><a href={SHOP.facebook} target="_blank" rel="noopener noreferrer" onClick={(event) => void nativeLink(event, () => openWebview({ url: SHOP.facebook }))}>Facebook cửa hàng</a><small>{SHOP.facebook}</small></dd>
            </dl>
            {contactError && <p role="alert">{contactError}</p>}
            <p>Vui lòng cung cấp mã đơn, thông tin liên hệ, nội dung phản ánh và chứng từ hoặc hình ảnh liên quan nếu có. Không cung cấp mật khẩu, mã OTP hoặc thông tin bảo mật thanh toán.</p>
            <p>Cửa hàng kiểm tra đơn hàng, thanh toán và giao nhận, sau đó thông báo kết quả cùng phương án xử lý. Với hàng sai, thiếu hoặc hỏng, cửa hàng xác nhận phương án trong vòng 4 giờ kể từ khi nhận phản ánh.</p>
            <p>Nếu cần thêm thông tin hoặc phối hợp với đơn vị thanh toán, cửa hàng thông báo tình trạng xử lý. Cửa hàng ưu tiên trao đổi để thống nhất phương án; khách vẫn có quyền sử dụng các phương thức giải quyết tranh chấp theo pháp luật.</p>
          </div>
        </details>}

        {initialSection !== "support" && <details data-section="privacy" open={initialSection === "privacy"} onToggle={(event) => setPrivacyOpen(event.currentTarget.open)}>
          <summary><h2>Bảo vệ dữ liệu cá nhân</h2></summary>
          <div className="terms-section-body">
            <p>{SHOP.companyName} xử lý dữ liệu phục vụ hoạt động Mini App.</p>
            <h3>Thông tin và mục đích sử dụng</h3>
            <p>Tùy chức năng sử dụng, dữ liệu có thể gồm thông tin nhận diện Zalo được cung cấp qua nền tảng và quyền khách cho phép; tên, số điện thoại, địa chỉ, ghi chú nhận hàng; giỏ hàng, đơn hàng, giao dịch thanh toán, yêu cầu hóa đơn, đổi trả và hỗ trợ.</p>
            <p>Cửa hàng sử dụng thông tin để xác nhận và thực hiện đơn, liên hệ khách, giao hàng, đối chiếu thanh toán, hoàn tiền, hỗ trợ và thực hiện nghĩa vụ liên quan đến giao dịch. Thông tin tài khoản ngân hàng được dùng khi khách chọn hoàn tiền qua chuyển khoản. Nhật ký kỹ thuật phục vụ vận hành, kiểm tra lỗi và bảo vệ hệ thống.</p>
            <p>Khi khách chủ động dùng vị trí hiện tại, dữ liệu vị trí hỗ trợ xác định địa chỉ và kiểm tra vùng giao hàng.</p>
            <h3>Các bên có thể nhận thông tin</h3>
            <p>Trong phạm vi phục vụ chức năng tương ứng, dữ liệu có thể được xử lý bởi nền tảng Zalo, ZaloPay, hệ thống quản lý bán hàng và Google Maps khi hỗ trợ xác định địa chỉ.</p>
            <p>Người giao được giao nhiệm vụ nhận tên khách, số điện thoại, địa chỉ chính xác và số tiền COD nếu có khi đến cửa hàng nhận hàng. Thông tin đầy đủ của khách không được gửi rộng rãi vào nhóm nhận đơn của shipper.</p>
            <h3>Quảng cáo và chương trình thành viên</h3>
            <p>Tích hợp quảng cáo hoặc chương trình thành viên qua Zalo OA dự kiến được triển khai sau. Trước khi triển khai, cửa hàng thông báo mục đích, dữ liệu sử dụng, nội dung, cách gửi và tần suất; cung cấp lựa chọn đồng ý riêng và cách ngừng nhận tin. Đặt hàng không được mặc định coi là đồng ý nhận quảng cáo.</p>
            <h3>Lưu giữ, bảo vệ và yêu cầu về dữ liệu</h3>
            <p>Thời hạn lưu theo từng nhóm dữ liệu và cách xử lý khi hết thời hạn: đang hoàn thiện. Các nghĩa vụ lưu giữ chứng từ và thông tin giao dịch được xem xét khi xử lý yêu cầu xóa dữ liệu.</p>
            <p>Cửa hàng áp dụng biện pháp quản lý quyền truy cập và bảo vệ dữ liệu phù hợp với hệ thống vận hành.</p>
            <p>Khách có thể yêu cầu xem, sửa thông tin, rút lại sự đồng ý hoặc yêu cầu xử lý, xóa dữ liệu theo phạm vi pháp luật cho phép. Cửa hàng xác minh người yêu cầu và thông báo kết quả, bao gồm lý do nếu cần tiếp tục lưu giữ thông tin.</p>
            <p>Yêu cầu về dữ liệu cá nhân được tiếp nhận qua đầu mối hỗ trợ chung ở mục Hỗ trợ và liên hệ tại Cá nhân.</p>
          </div>
          {privacyOpen && children}
        </details>}
        <Button fullWidth variant="secondary" onClick={onClose} aria-label={initialSection === "support" ? "Đóng hỗ trợ" : "Đóng thông tin"}>Đóng</Button>
      </section>
    </Sheet>
  );
}
